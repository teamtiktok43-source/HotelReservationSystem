from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from datetime import date, datetime, timezone, timedelta
from email.message import EmailMessage
import base64
from html import escape
import json
import os
import secrets
from pathlib import Path
import bcrypt
import hmac

from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.auth.transport.requests import AuthorizedSession
from googleapiclient.discovery import build

from database import AsyncSessionLocal, Base, engine

from models import (
    Reservation,
    ReservationRoom,
    PrintedReservation,
    User,
    Hotel,
    HotelAttachment,
    RoomType,
    RatePlan,
    Nationality,
    GuestCountOption,
)


app = FastAPI(
    title="Hotel Reservation System API",
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://hotel-reservation-system.orkestr.run",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# OAuth state/session protection. The secret is only used to protect the
# temporary OAuth state during the Google login flow.
SESSION_SECRET = os.getenv("SESSION_SECRET") or secrets.token_urlsafe(32)
OAUTH_STATES: dict[str, str] = {}

# =========================================================
# Role-Based Access Control
# =========================================================

ROLE_MANAGER = "Manager"
ROLE_IT = "IT"
ROLE_RESERVATION_EMPLOYEE = "Reservation Employee"

ALLOWED_ROLES = {
    ROLE_MANAGER,
    ROLE_IT,
    ROLE_RESERVATION_EMPLOYEE,
}


def normalize_role(role: str | None) -> str:
    """Normalize current and legacy role names."""
    value = (role or "").strip().lower()

    if value in {
        "administrator",
        "admin",
        "manager",
        "مدير",
    }:
        return ROLE_MANAGER

    if value in {
        "it",
        "i.t",
        "it administrator",
        "technical",
        "technical support",
    }:
        return ROLE_IT

    if value in {
        "reservation employee",
        "reservations employee",
        "reservation officer",
        "reservations officer",
        "employee",
        "reservations",
        "موظف حجوزات",
    }:
        return ROLE_RESERVATION_EMPLOYEE

    # Unknown/empty legacy roles are treated as the least-privileged role.
    return ROLE_RESERVATION_EMPLOYEE


LICENSE_DURATION_DAYS = 30
LICENSE_CODE_PREFIX = "HRS"

LICENSE_PUBLIC_PATHS = {
    "/license/status",
}

LICENSE_EXEMPT_PATHS = {
    "/license/status",
    "/license/generate",
    "/license/activate",
}


def normalize_activation_code(value: str | None) -> str:
    return (value or "").strip().upper().replace(" ", "")


def generate_activation_code() -> str:
    raw = secrets.token_hex(6).upper()
    return (
        f"{LICENSE_CODE_PREFIX}-"
        f"{raw[:4]}-"
        f"{raw[4:8]}-"
        f"{raw[8:]}"
    )


async def ensure_license_tables() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS system_license (
                    id SMALLINT PRIMARY KEY,
                    activated_at TIMESTAMP WITH TIME ZONE,
                    expires_at TIMESTAMP WITH TIME ZONE,
                    activated_by INTEGER REFERENCES users(id)
                        ON DELETE SET NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                        DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )

        await conn.execute(
            text(
                """
                INSERT INTO system_license (
                    id,
                    activated_at,
                    expires_at,
                    activated_by
                )
                VALUES (1, NULL, NULL, NULL)
                ON CONFLICT (id) DO NOTHING
                """
            )
        )

        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS license_keys (
                    id SERIAL PRIMARY KEY,
                    code_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL
                        DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER REFERENCES users(id)
                        ON DELETE SET NULL,
                    used_at TIMESTAMP WITH TIME ZONE,
                    used_by INTEGER REFERENCES users(id)
                        ON DELETE SET NULL,
                    is_used BOOLEAN NOT NULL DEFAULT FALSE
                )
                """
            )
        )

        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS
                    ix_license_keys_is_used
                ON license_keys(is_used)
                """
            )
        )


async def get_license_status() -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(
                """
                SELECT activated_at, expires_at, activated_by
                FROM system_license
                WHERE id = 1
                """
            )
        )
        row = result.mappings().first()

    if not row or not row["expires_at"]:
        return {
            "active": False,
            "activated_at": None,
            "expires_at": None,
            "days_remaining": 0,
            "message": "System license has not been activated.",
        }

    now = datetime.now(timezone.utc)
    expires_at = row["expires_at"]

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    remaining_seconds = (expires_at - now).total_seconds()
    active = remaining_seconds > 0

    days_remaining = (
        max(0, int(remaining_seconds // 86400) + (1 if remaining_seconds > 0 else 0))
        if active
        else 0
    )

    return {
        "active": active,
        "activated_at": row["activated_at"],
        "expires_at": expires_at,
        "days_remaining": days_remaining,
        "message": (
            "License is active."
            if active
            else "System license has expired."
        ),
    }


async def license_is_active() -> bool:
    status = await get_license_status()
    return bool(status["active"])


async def generate_license_key(created_by: int) -> str:
    code = generate_activation_code()
    code_hash = bcrypt.hashpw(
        code.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    async with AsyncSessionLocal() as session:
        # Only one pending code is valid at a time.
        await session.execute(
            text(
                """
                UPDATE license_keys
                SET is_used = TRUE,
                    used_at = CURRENT_TIMESTAMP
                WHERE is_used = FALSE
                """
            )
        )

        await session.execute(
            text(
                """
                INSERT INTO license_keys (
                    code_hash,
                    created_by
                )
                VALUES (:code_hash, :created_by)
                """
            ),
            {
                "code_hash": code_hash,
                "created_by": created_by,
            },
        )

        await session.commit()

    return code


async def activate_license(
    request: Request,
    code: str,
) -> dict:
    normalized_code = normalize_activation_code(code)

    if not normalized_code:
        raise HTTPException(
            status_code=400,
            detail="Activation code is required",
        )

    user_id = int(request.session.get("user_id"))

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(
                """
                SELECT id, code_hash
                FROM license_keys
                WHERE is_used = FALSE
                ORDER BY id DESC
                """
            )
        )

        pending_keys = result.mappings().all()
        matched_key_id = None

        for item in pending_keys:
            try:
                if bcrypt.checkpw(
                    normalized_code.encode("utf-8"),
                    item["code_hash"].encode("utf-8"),
                ):
                    matched_key_id = item["id"]
                    break
            except ValueError:
                continue

        if matched_key_id is None:
            raise HTTPException(
                status_code=400,
                detail="Invalid or already used activation code",
            )

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=LICENSE_DURATION_DAYS)

        await session.execute(
            text(
                """
                UPDATE system_license
                SET activated_at = :activated_at,
                    expires_at = :expires_at,
                    activated_by = :activated_by,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                """
            ),
            {
                "activated_at": now,
                "expires_at": expires_at,
                "activated_by": user_id,
            },
        )

        await session.execute(
            text(
                """
                UPDATE license_keys
                SET is_used = TRUE,
                    used_at = :used_at,
                    used_by = :used_by
                WHERE id = :id
                """
            ),
            {
                "used_at": now,
                "used_by": user_id,
                "id": matched_key_id,
            },
        )

        await session.commit()

    return {
        "success": True,
        "message": "System activated successfully.",
        "activated_at": now,
        "expires_at": expires_at,
        "days": LICENSE_DURATION_DAYS,
    }


def _is_public_path(path: str) -> bool:
    return (
        path == "/"
        or path == "/login"
        or path == "/bootstrap/reset-it-password"
        or path.startswith("/auth/google/")
        or path.startswith("/uploads/")
    )


def _required_roles_for_request(method: str, path: str) -> set[str] | None:
    """Return a role restriction for sensitive endpoints."""
    method = method.upper()

    # Database diagnostics are IT-only.
    if path == "/database-test":
        return {ROLE_IT}

    # User administration is Manager/IT only.
    if path == "/users" or path.startswith("/users/"):
        return {ROLE_MANAGER, ROLE_IT}

    # Master-data management is Manager/IT only.
    if path == "/hotels" and method != "GET":
        return {ROLE_MANAGER, ROLE_IT}

    if path.startswith("/hotels/") and method != "GET":
        return {ROLE_MANAGER, ROLE_IT}

    if path == "/room-types" and method != "GET":
        return {ROLE_MANAGER, ROLE_IT}

    if path == "/rate-plans" and method != "GET":
        return {ROLE_MANAGER, ROLE_IT}

    # Email/Gmail configuration is Manager/IT only.
    if path == "/email-settings" or path.startswith("/email-settings/"):
        return {ROLE_MANAGER, ROLE_IT}

    # Disconnecting Gmail is Manager/IT only.
    if path.startswith("/auth/google/disconnect"):
        return {ROLE_MANAGER, ROLE_IT}

    # License generation and activation are IT-only.
    if path == "/license/generate":
        return {ROLE_IT}

    if path == "/license/activate":
        return {ROLE_IT}

    # License status is available to every authenticated user so the
    # frontend can display the activation state.
    if path == "/license/status":
        return None

    # All remaining application endpoints are available to authenticated
    # users. Reservation Employees can operate reservations, receipts,
    # emails, confirmations, status, printing and reports.
    return None


@app.middleware("http")
async def authorization_middleware(request: Request, call_next):
    """
    Backend security boundary.

    The frontend will also hide restricted controls, but permissions are
    enforced here so direct API calls cannot bypass them.
    """

    # CORS preflight requests are sent by the browser before protected
    # POST/PATCH/PUT/DELETE requests. The preflight request itself does not
    # carry the authenticated session cookie, so it must pass through the
    # middleware before authentication and role checks.
    if request.method.upper() == "OPTIONS":
        return await call_next(request)

    path = request.url.path

    if _is_public_path(path):
        return await call_next(request)

    user_id = request.session.get("user_id")

    if not user_id:
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
        )

    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        request.session.clear()
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.id == user_id_int)
        )
        current_user = result.scalar_one_or_none()

    if not current_user:
        request.session.clear()
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
        )

    if not current_user.is_active:
        request.session.clear()
        return JSONResponse(
            status_code=403,
            content={"detail": "This user is inactive"},
        )

    normalized_role = normalize_role(current_user.role)

    request.session["user_id"] = current_user.id
    request.session["username"] = current_user.username
    request.session["role"] = normalized_role

    required_roles = _required_roles_for_request(
        request.method,
        path,
    )

    if required_roles is not None and normalized_role not in required_roles:
        return JSONResponse(
            status_code=403,
            content={
                "detail":
                    "You do not have permission to perform this action"
            },
        )

    # License management remains available when the license is expired,
    # so IT can generate and activate the next monthly license.
    if path in LICENSE_EXEMPT_PATHS:
        return await call_next(request)

    # Keep login/session discovery available so the frontend can identify
    # the IT user and show the activation screen instead of treating the
    # user as logged out.
    if path == "/auth/me":
        return await call_next(request)

    if not await license_is_active():
        return JSONResponse(
            status_code=423,
            content={
                "detail": "SYSTEM_LICENSE_EXPIRED",
                "message": (
                    "The system license has expired. "
                    "IT activation is required."
                ),
            },
        )

    return await call_next(request)

# =========================================================
# Uploads
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
PAYMENT_RECEIPTS_DIR = UPLOADS_DIR / "payment-receipts"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
PAYMENT_RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOADS_DIR)),
    name="uploads",
)


# =========================================================
# Request Models
# =========================================================

class LoginRequest(BaseModel):
    username: str
    password: str


class TemporaryITPasswordResetRequest(BaseModel):
    new_password: str



# =========================================================
# User Management Requests
# =========================================================

class UserCreateRequest(BaseModel):
    username: str
    password: str
    full_name: str | None = None
    role: str | None = None
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    username: str | None = None
    password: str | None = None
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


# =========================================================
# Reservation Room Request
# =========================================================

class ReservationRoomCreate(BaseModel):
    room_type_id: int
    rate_plan_id: int
    total_price_usd: float


# =========================================================
# Reservation Create
# =========================================================

class ReservationCreate(BaseModel):

    booking_number: str

    hotel_id: int | None = None

    guest_name: str | None = None

    total_guest: int | None = None

    adult_count: int | None = None

    child_count: int | None = None

    nationality: str | None = None

    check_in: date | None = None

    check_out: date | None = None

    payment_type: str | None = None

    rooms: list[ReservationRoomCreate]

    exchange_rate: float | None = None

    guest_requests: str | None = None

    created_by: str | None = None


# =========================================================
# Email Send Request
# =========================================================

class ReservationEmailRequest(BaseModel):

    sent_by: str | None = None

    recipient_email: str | None = None

# =========================================================
# Printed Reservation Requests
# =========================================================

class PrintedReservationCreate(BaseModel):

    printed_by: str | None = None

    copies: int = 1


# =========================================================
# Email Settings Requests
# =========================================================

class EmailTestRequest(BaseModel):

    recipient_email: str


# =========================================================
# Hotel Create
# =========================================================

class HotelCreate(BaseModel):

    name: str

    email: str | None = None

    phone: str | None = None

    address: str | None = None

    is_active: bool = True


# =========================================================
# Room Type Create
# =========================================================

class RoomTypeCreate(BaseModel):

    name: str

    code: str | None = None

    is_active: bool = True


class RoomTypeUpdate(BaseModel):

    name: str | None = None

    code: str | None = None

    is_active: bool | None = None


class NationalityCreate(BaseModel):

    code: str

    name: str

    is_active: bool = True


class NationalityUpdate(BaseModel):

    code: str | None = None

    name: str | None = None

    is_active: bool | None = None


class GuestCountOptionCreate(BaseModel):

    adults: int

    children: int = 0

    code: str | None = None

    label: str | None = None

    is_active: bool = True


class GuestCountOptionUpdate(BaseModel):

    adults: int | None = None

    children: int | None = None

    code: str | None = None

    label: str | None = None

    is_active: bool | None = None


# =========================================================
# Rate Plan Create
# =========================================================

class RatePlanCreate(BaseModel):

    code: str

    name: str

    meals: str | None = None

    is_active: bool = True


# =========================================================
# Nationality Mapping
# =========================================================

NATIONALITIES = {

    "eg": "Egypt",
    "egy": "Egypt",
    "egypt": "Egypt",

    "us": "United States",
    "usa": "United States",
    "united states": "United States",

    "gb": "United Kingdom",
    "uk": "United Kingdom",
    "united kingdom": "United Kingdom",

    "ca": "Canada",
    "canada": "Canada",

    "au": "Australia",
    "australia": "Australia",

    "de": "Germany",
    "germany": "Germany",

    "fr": "France",
    "france": "France",

    "it": "Italy",
    "italy": "Italy",

    "es": "Spain",
    "spain": "Spain",

    "sa": "Saudi Arabia",
    "ksa": "Saudi Arabia",

    "ae": "United Arab Emirates",
    "uae": "United Arab Emirates",

    "kw": "Kuwait",
    "kuwait": "Kuwait",

    "qa": "Qatar",
    "qatar": "Qatar",

    "bh": "Bahrain",
    "bahrain": "Bahrain",

    "om": "Oman",
    "oman": "Oman",

    "jo": "Jordan",
    "jordan": "Jordan",

    "lb": "Lebanon",
    "lebanon": "Lebanon",

    "sy": "Syria",
    "syria": "Syria",

    "iq": "Iraq",
    "iraq": "Iraq",

    "tr": "Turkey",
    "turkey": "Turkey",

    "ru": "Russia",
    "russia": "Russia",

    "cn": "China",
    "china": "China",

    "jp": "Japan",
    "japan": "Japan",

    "kr": "South Korea",
    "south korea": "South Korea",

    "in": "India",
    "india": "India",

    "pk": "Pakistan",
    "pakistan": "Pakistan",

    "br": "Brazil",
    "brazil": "Brazil",

    "mx": "Mexico",
    "mexico": "Mexico",

    "za": "South Africa",
    "south africa": "South Africa",

    "ng": "Nigeria",
    "nigeria": "Nigeria",

    "ma": "Morocco",
    "morocco": "Morocco",

    "dz": "Algeria",
    "algeria": "Algeria",

    "tn": "Tunisia",
    "tunisia": "Tunisia",

    "ly": "Libya",
    "libya": "Libya",

    "sd": "Sudan",
    "sudan": "Sudan",
}


def normalize_nationality(
    value: str | None
):

    if not value:
        return None

    cleaned = value.strip()

    if not cleaned:
        return None

    key = cleaned.lower()

    return NATIONALITIES.get(
        key,
        cleaned
    )


# =========================================================
# Payment Types
# =========================================================

ALLOWED_PAYMENT_TYPES = {

    "booking_paid",
    "booking_cash",

    "expedia_paid",
    "expedia_cash",

    "trip_paid",
    "trip_cash",

    "agoda_paid",
    "agoda_cash",
}


# =========================================================
# Helpers
# =========================================================

def is_cash_payment(
    payment_type: str | None
):

    if not payment_type:
        return False

    return payment_type.endswith("_cash")


def calculate_nights(
    check_in: date | None,
    check_out: date | None,
):

    if not check_in or not check_out:
        return None

    return (
        check_out - check_in
    ).days


def format_date_for_email(
    value: date | None
):

    if not value:
        return "-"

    return value.strftime("%d/%m/%Y")


def get_payment_label(
    payment_type: str | None
):

    labels = {

        "booking_paid":
            "Booking.com - Paid",

        "booking_cash":
            "Booking.com - Cash",

        "expedia_paid":
            "Expedia - Paid",

        "expedia_cash":
            "Expedia - Cash",

        "trip_paid":
            "Trip.com - Paid",

        "trip_cash":
            "Trip.com - Cash",

        "agoda_paid":
            "Agoda - Paid",

        "agoda_cash":
            "Agoda - Cash",

    }

    return labels.get(
        payment_type,
        payment_type or "-"
    )


# =========================================================
# Google OAuth / Gmail API Configuration
# =========================================================

PAYMENT_RECEIPT_MAX_BYTES = 10 * 1024 * 1024
ALLOWED_RECEIPT_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

HOTEL_FILES_DIR = UPLOADS_DIR / "hotel-files"
HOTEL_FILES_DIR.mkdir(parents=True, exist_ok=True)

MAX_HOTEL_FILE_BYTES = 25 * 1024 * 1024
HOTEL_IMAGE_PREFIX = "image/"

GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/google/callback",
)
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000",
).rstrip("/")

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.send",
]

GOOGLE_TOKEN_FILE = BASE_DIR / "google_token.json"


def find_google_client_secret_file() -> Path:
    candidates = sorted(
        BASE_DIR.glob("client_secret*.json"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )

    if not candidates:
        raise FileNotFoundError(
            "Google OAuth client JSON was not found in the backend folder."
        )

    return candidates[0]


def save_google_credentials(credentials: Credentials) -> None:
    GOOGLE_TOKEN_FILE.write_text(
        credentials.to_json(),
        encoding="utf-8",
    )


def load_google_credentials() -> Credentials | None:
    if not GOOGLE_TOKEN_FILE.exists():
        return None

    try:
        data = json.loads(
            GOOGLE_TOKEN_FILE.read_text(encoding="utf-8")
        )

        credentials = Credentials.from_authorized_user_info(
            data,
            GOOGLE_SCOPES,
        )

        if credentials.expired and credentials.refresh_token:
            credentials.refresh(GoogleAuthRequest())
            save_google_credentials(credentials)

        if not credentials.valid:
            return None

        return credentials

    except Exception as error:
        print(f"[Google OAuth] Failed to load token: {error}")
        return None


def google_connected() -> bool:
    return load_google_credentials() is not None


def get_gmail_service():
    credentials = load_google_credentials()

    if not credentials:
        raise HTTPException(
            status_code=400,
            detail="Gmail is not connected. Click Connect Gmail first.",
        )

    try:
        return build(
            "gmail",
            "v1",
            credentials=credentials,
            cache_discovery=False,
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not start the Gmail API: {error}",
        )


def get_connected_google_email() -> str | None:
    credentials = load_google_credentials()

    if not credentials:
        return None

    try:
        # Gmail API's users.getProfile requires broader Gmail profile scopes
        # than we need for sending mail. We already request the OpenID/email
        # scopes, so read the signed-in account from Google's UserInfo endpoint.
        session = AuthorizedSession(credentials)
        response = session.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        email = data.get("email")

        if email:
            return email

        print("[Google OAuth] UserInfo response did not contain an email")
        return None
    except Exception as error:
        print(f"[Google OAuth] Failed to get Google account email: {error}")
        return None


def gmail_send_message(
    recipient: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
    service = get_gmail_service()
    sender = get_connected_google_email()

    if not sender:
        raise RuntimeError(
            "Could not determine the connected Gmail account. Reconnect Gmail."
        )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content(body)

    if html_body:
        message.add_alternative(
            html_body,
            subtype="html",
        )

    encoded_message = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("utf-8")

    service.users().messages().send(
        userId="me",
        body={"raw": encoded_message},
    ).execute()


def serialize_email_settings():
    email = get_connected_google_email()
    return {
        "configured": bool(email),
        "provider": "gmail",
        "email": email or "",
        "connected": bool(email),
        "auth_url": "/auth/google/start",
    }


# =========================================================
# Hotel Attachment Helpers
# =========================================================

def serialize_hotel_attachment(
    attachment: HotelAttachment,
):
    return {
        "id": attachment.id,
        "hotel_id": attachment.hotel_id,
        # Keep the API response shape stable for the frontend,
        # while using the actual SQLAlchemy model field names.
        "original_name": attachment.original_filename,
        "stored_name": attachment.stored_filename,
        "content_type": attachment.content_type,
        "file_size": attachment.file_size,
        "is_image": bool(
            attachment.content_type
            and attachment.content_type.lower().startswith(
                HOTEL_IMAGE_PREFIX
            )
        ),
        "is_pdf": attachment.content_type == "application/pdf",
        "url": (
            f"/uploads/hotel-files/{attachment.hotel_id}/"
            f"{attachment.stored_filename}"
        ),
        "created_at": attachment.uploaded_at,
    }


async def serialize_hotel(
    session,
    hotel: Hotel,
):
    result = await session.execute(
        select(HotelAttachment)
        .where(
            HotelAttachment.hotel_id == hotel.id
        )
        .order_by(
            HotelAttachment.id.desc()
        )
    )

    attachments = result.scalars().all()

    return {
        "id": hotel.id,
        "name": hotel.name,
        "email": hotel.email,
        "phone": hotel.phone,
        "address": hotel.address,
        "is_active": hotel.is_active,
        "created_at": hotel.created_at,
        "attachments": [
            serialize_hotel_attachment(item)
            for item in attachments
        ],
    }


# =========================================================
# Serialize Room
# =========================================================

def serialize_room(
    room: ReservationRoom
):

    return {

        "id":
            room.id,

        "room_type_id":
            room.room_type_id,

        "room_type":
            (
                room.room_type.name
                if room.room_type
                else None
            ),

        "rate_plan_id":
            room.rate_plan_id,

        "rate_plan_code":
            (
                room.rate_plan.code
                if room.rate_plan
                else None
            ),

        "rate_plan_name":
            (
                room.rate_plan.name
                if room.rate_plan
                else None
            ),

        "meals":
            (
                room.rate_plan.meals
                if room.rate_plan
                else None
            ),

        "nights":
            room.nights,

        "total_price_usd":
            float(room.total_price_usd),

        "nightly_rate_usd":
            float(room.nightly_rate_usd),

        "total_price_egp":
            (
                float(room.total_price_egp)
                if room.total_price_egp is not None
                else None
            ),

        "nightly_rate_egp":
            (
                float(room.nightly_rate_egp)
                if room.nightly_rate_egp is not None
                else None
            ),

        "exchange_rate":
            (
                float(room.exchange_rate)
                if room.exchange_rate is not None
                else None
            ),
    }


# =========================================================
# Guest Composition
# =========================================================

def format_guest_composition(
    adult_count: int | None,
    child_count: int | None,
    legacy_total: int | None = None,
) -> str:
    adults = (
        int(adult_count)
        if adult_count is not None
        else None
    )

    children = (
        int(child_count)
        if child_count is not None
        else None
    )

    if adults is None and children is None:
        if legacy_total is None:
            return "-"
        adults = int(legacy_total)
        children = 0

    adults = max(0, adults or 0)
    children = max(0, children or 0)

    parts: list[str] = []

    if adults:
        parts.append(
            f"{adults} Adult"
            if adults == 1
            else f"{adults} Adults"
        )

    if children:
        parts.append(
            f"{children} Child"
            if children == 1
            else f"{children} Children"
        )

    return " + ".join(parts) or "0"


# =========================================================
# Serialize Reservation
# =========================================================

def serialize_reservation(
    reservation: Reservation
):

    rooms = [
        serialize_room(room)
        for room in reservation.rooms
    ]

    total_price_usd = sum(
        room["total_price_usd"]
        for room in rooms
    )

    total_price_egp = None

    if rooms and any(
        room["total_price_egp"] is not None
        for room in rooms
    ):

        total_price_egp = sum(
            room["total_price_egp"] or 0
            for room in rooms
        )

    hotel_data = None

    if reservation.hotel:

        hotel_data = {

            "id":
                reservation.hotel.id,

            "name":
                reservation.hotel.name,

            "email":
                reservation.hotel.email,

            "phone":
                reservation.hotel.phone,

            "address":
                reservation.hotel.address,

        }

    return {

        "id":
            reservation.id,

        "booking_number":
            reservation.booking_number,

        "hotel_id":
            reservation.hotel_id,

        "hotel":
            hotel_data,

        "guest_name":
            reservation.guest_name,

        "total_guest":
            reservation.total_guest,

        "adult_count":
            reservation.adult_count,

        "child_count":
            reservation.child_count,

        "guest_count_label":
            format_guest_composition(
                reservation.adult_count,
                reservation.child_count,
                reservation.total_guest,
            ),

        "nationality":
            reservation.nationality,

        "check_in":
            reservation.check_in,

        "check_out":
            reservation.check_out,

        "nights":
            calculate_nights(
                reservation.check_in,
                reservation.check_out,
            ),

        "payment_type":
            reservation.reservation_type,

        "payment_label":
            get_payment_label(
                reservation.reservation_type
            ),

        "rooms":
            rooms,

        "room_count":
            len(rooms),

        "total_price_usd":
            total_price_usd,

        "total_price_egp":
            total_price_egp,

        "guest_requests":
            reservation.guest_requests,

        "status":
            reservation.status,

        "created_by":
            reservation.created_by,

        "hotel_confirmation_number":
            reservation.hotel_confirmation_number,

        "email_status":
            reservation.email_status,

        "email_sent_at":
            reservation.email_sent_at,

        "email_error":
            reservation.email_error,

        "payment_receipt_path":
            reservation.payment_receipt_path,

        "payment_receipt_last4":
            reservation.payment_receipt_last4,

        "payment_receipt_url":
            (
                f"/uploads/payment-receipts/{reservation.payment_receipt_path}"
                if reservation.payment_receipt_path
                else None
            ),

        "created_at":
            reservation.created_at,

        "updated_at":
            reservation.updated_at,
    }


# =========================================================
# Database Migration
# =========================================================

async def migrate_database():

    """
    Add new columns to the existing database
    without deleting existing data.

    Important:
    reservation_rooms may contain different columns in older databases
    than the current schema. Only required columns are added
    while preserving existing columns and data.

    PostgreSQL:
    TIMESTAMP WITH TIME ZONE
    rather than DATETIME.

    Each migration uses an independent transaction
    so a failure in one column does not stop the remaining migrations.
    """

    migrations = [

        # =====================================================
        # Reservations - new fields
        # =====================================================

        (
            "adult_count",
            """
            ALTER TABLE reservations
            ADD COLUMN adult_count INTEGER
            """
        ),

        (
            "child_count",
            """
            ALTER TABLE reservations
            ADD COLUMN child_count INTEGER
            """
        ),

        (
            "created_by",
            """
            ALTER TABLE reservations
            ADD COLUMN created_by VARCHAR
            """
        ),

        (
            "hotel_confirmation_number",
            """
            ALTER TABLE reservations
            ADD COLUMN hotel_confirmation_number VARCHAR
            """
        ),

        (
            "email_status",
            """
            ALTER TABLE reservations
            ADD COLUMN email_status VARCHAR
            NOT NULL DEFAULT 'not_required'
            """
        ),

        (
            "email_sent_at",
            """
            ALTER TABLE reservations
            ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE
            """
        ),

        (
            "email_error",
            """
            ALTER TABLE reservations
            ADD COLUMN email_error TEXT
            """
        ),

        (
            "payment_receipt_path",
            """
            ALTER TABLE reservations
            ADD COLUMN payment_receipt_path VARCHAR
            """
        ),

        (
            "payment_receipt_last4",
            """
            ALTER TABLE reservations
            ADD COLUMN payment_receipt_last4 VARCHAR(4)
            """
        ),

        # =====================================================
        # Reservation Rooms - new schema fields
        #
        # The existing database has:
        # id, reservation_id, room_number, room_type,
        # price_per_night, total_nights, room_total, created_at
        #
        # The current SQLAlchemy model/code needs these fields.
        # We add them without deleting the old columns/data.
        # =====================================================

        (
            "room_type_id",
            """
            ALTER TABLE reservation_rooms
            ADD COLUMN room_type_id INTEGER
            """
        ),

        (
            "rate_plan_id",
            """
            ALTER TABLE reservation_rooms
            ADD COLUMN rate_plan_id INTEGER
            """
        ),

        (
            "nights",
            """
            ALTER TABLE reservation_rooms
            ADD COLUMN nights INTEGER
            """
        ),

        (
            "total_price_usd",
            """
            ALTER TABLE reservation_rooms
            ADD COLUMN total_price_usd NUMERIC(12, 2)
            """
        ),

        (
            "nightly_rate_usd",
            """
            ALTER TABLE reservation_rooms
            ADD COLUMN nightly_rate_usd NUMERIC(12, 2)
            """
        ),

        (
            "total_price_egp",
            """
            ALTER TABLE reservation_rooms
            ADD COLUMN total_price_egp NUMERIC(12, 2)
            """
        ),

        (
            "nightly_rate_egp",
            """
            ALTER TABLE reservation_rooms
            ADD COLUMN nightly_rate_egp NUMERIC(12, 2)
            """
        ),

        (
            "exchange_rate",
            """
            ALTER TABLE reservation_rooms
            ADD COLUMN exchange_rate NUMERIC(12, 4)
            """
        ),

        # =====================================================
        # Printed Reservations - print history table
        # =====================================================
        (
            "printed_reservations_table",
            """
            CREATE TABLE IF NOT EXISTS printed_reservations (
                id SERIAL PRIMARY KEY,
                reservation_id INTEGER NOT NULL
                    REFERENCES reservations(id)
                    ON DELETE CASCADE,
                booking_number VARCHAR NOT NULL,
                printed_by VARCHAR,
                copies INTEGER NOT NULL DEFAULT 1,
                printed_at TIMESTAMP WITH TIME ZONE NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            )
            """
        ),

        (
            "printed_reservations_reservation_index",
            """
            CREATE INDEX IF NOT EXISTS
                ix_printed_reservations_reservation_id
            ON printed_reservations(reservation_id)
            """
        ),

        (
            "printed_reservations_booking_index",
            """
            CREATE INDEX IF NOT EXISTS
                ix_printed_reservations_booking_number
            ON printed_reservations(booking_number)
            """
        ),

        (
            "printed_reservations_copies",
            """
            ALTER TABLE printed_reservations
            ADD COLUMN copies INTEGER NOT NULL DEFAULT 1
            """
        ),

        # =====================================================
        # Master Data - Room Type Code
        # =====================================================

        (
            "room_types_code",
            """
            ALTER TABLE room_types
            ADD COLUMN code VARCHAR(30)
            """
        ),

        (
            "room_types_code_index",
            """
            CREATE UNIQUE INDEX IF NOT EXISTS
                ux_room_types_code
            ON room_types(code)
            """
        ),

        # =====================================================
        # Master Data - Nationalities
        # =====================================================

        (
            "nationalities_table",
            """
            CREATE TABLE IF NOT EXISTS nationalities (
                id SERIAL PRIMARY KEY,
                code VARCHAR(20) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            )
            """
        ),

        (
            "nationalities_name_index",
            """
            CREATE INDEX IF NOT EXISTS
                ix_nationalities_name
            ON nationalities(name)
            """
        ),

        # =====================================================
        # Master Data - Guest Count Options
        # =====================================================

        (
            "guest_count_options_table",
            """
            CREATE TABLE IF NOT EXISTS guest_count_options (
                id SERIAL PRIMARY KEY,
                adults INTEGER NOT NULL,
                children INTEGER NOT NULL DEFAULT 0,
                code VARCHAR(30) NOT NULL UNIQUE,
                label VARCHAR(100) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            )
            """
        ),

        (
            "guest_count_options_label_index",
            """
            CREATE INDEX IF NOT EXISTS
                ix_guest_count_options_label
            ON guest_count_options(label)
            """
        ),

        # =====================================================
        # Hotel Attachments
        # =====================================================

        (
            "hotel_attachments_table",
            """
            CREATE TABLE IF NOT EXISTS hotel_attachments (
                id SERIAL PRIMARY KEY,
                hotel_id INTEGER NOT NULL
                    REFERENCES hotels(id)
                    ON DELETE CASCADE,
                original_filename VARCHAR NOT NULL,
                stored_filename VARCHAR NOT NULL UNIQUE,
                content_type VARCHAR,
                file_size BIGINT,
                uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            )
            """
        ),

        (
            "hotel_attachments_hotel_index",
            """
            CREATE INDEX IF NOT EXISTS
                ix_hotel_attachments_hotel_id
            ON hotel_attachments(hotel_id)
            """
        ),

        (
            "hotel_attachments_compatibility_columns",
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'hotel_attachments'
                      AND column_name = 'original_name'
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'hotel_attachments'
                      AND column_name = 'original_filename'
                )
                THEN
                    ALTER TABLE hotel_attachments
                    RENAME COLUMN original_name TO original_filename;
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'hotel_attachments'
                      AND column_name = 'stored_name'
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'hotel_attachments'
                      AND column_name = 'stored_filename'
                )
                THEN
                    ALTER TABLE hotel_attachments
                    RENAME COLUMN stored_name TO stored_filename;
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'hotel_attachments'
                      AND column_name = 'created_at'
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'hotel_attachments'
                      AND column_name = 'uploaded_at'
                )
                THEN
                    ALTER TABLE hotel_attachments
                    RENAME COLUMN created_at TO uploaded_at;
                END IF;
            END
            $$;
            """
        ),

        # =====================================================
        # Display language cleanup - existing data
        # =====================================================

        (
            "translate_existing_rate_plan_meals",
            """
            UPDATE rate_plans
            SET meals = CASE meals
                WHEN 'فطار' THEN 'Breakfast'
                WHEN 'فطار + غداء أو عشاء' THEN 'Breakfast + Lunch or Dinner'
                WHEN 'فطار + غداء + عشاء' THEN 'Breakfast + Lunch + Dinner'
                WHEN 'بدون وجبات' THEN 'Room Only'
                ELSE meals
            END
            WHERE meals IN (
                'فطار',
                'فطار + غداء أو عشاء',
                'فطار + غداء + عشاء',
                'بدون وجبات'
            )
            """
        ),

        (
            "translate_existing_nationalities",
            """
            UPDATE reservations
            SET nationality = CASE LOWER(TRIM(nationality))
                WHEN 'مصر' THEN 'Egypt'
                WHEN 'الولايات المتحدة' THEN 'United States'
                WHEN 'المملكة المتحدة' THEN 'United Kingdom'
                WHEN 'الإمارات' THEN 'United Arab Emirates'
                WHEN 'السعودية' THEN 'Saudi Arabia'
                WHEN 'الكويت' THEN 'Kuwait'
                WHEN 'قطر' THEN 'Qatar'
                WHEN 'البحرين' THEN 'Bahrain'
                WHEN 'عُمان' THEN 'Oman'
                WHEN 'الأردن' THEN 'Jordan'
                WHEN 'لبنان' THEN 'Lebanon'
                WHEN 'سوريا' THEN 'Syria'
                WHEN 'العراق' THEN 'Iraq'
                WHEN 'ليبيا' THEN 'Libya'
                WHEN 'تونس' THEN 'Tunisia'
                WHEN 'الجزائر' THEN 'Algeria'
                WHEN 'المغرب' THEN 'Morocco'
                WHEN 'السودان' THEN 'Sudan'
                WHEN 'فلسطين' THEN 'Palestine'
                WHEN 'ألمانيا' THEN 'Germany'
                WHEN 'فرنسا' THEN 'France'
                WHEN 'إيطاليا' THEN 'Italy'
                WHEN 'إسبانيا' THEN 'Spain'
                WHEN 'هولندا' THEN 'Netherlands'
                WHEN 'بلجيكا' THEN 'Belgium'
                WHEN 'سويسرا' THEN 'Switzerland'
                WHEN 'النمسا' THEN 'Austria'
                WHEN 'روسيا' THEN 'Russia'
                WHEN 'أوكرانيا' THEN 'Ukraine'
                WHEN 'تركيا' THEN 'Turkey'
                WHEN 'الصين' THEN 'China'
                WHEN 'اليابان' THEN 'Japan'
                WHEN 'كوريا الجنوبية' THEN 'South Korea'
                WHEN 'الهند' THEN 'India'
                WHEN 'باكستان' THEN 'Pakistan'
                WHEN 'أستراليا' THEN 'Australia'
                WHEN 'كندا' THEN 'Canada'
                WHEN 'البرازيل' THEN 'Brazil'
                WHEN 'المكسيك' THEN 'Mexico'
                WHEN 'جنوب أفريقيا' THEN 'South Africa'
                ELSE nationality
            END
            WHERE nationality IS NOT NULL
            """
        ),

    ]

    for column_name, sql in migrations:

        try:

            async with engine.begin() as conn:

                await conn.execute(
                    text(sql)
                )

            print(
                f"[Migration] Added column: {column_name}"
            )

        except Exception as error:

            error_text = str(
                error
            ).lower()

            if (
                "duplicate column" in error_text
                or
                "already exists" in error_text
            ):

                print(
                    f"[Migration] Already exists: {column_name}"
                )

                continue

            print(
                f"[Migration] Skipped {column_name}: {error}"
            )


# =========================================================
# Seed Default Data
# =========================================================

async def seed_default_data():

    async with AsyncSessionLocal() as session:

        # =====================================================
        # User Master Data - Hotels from Excel list
        # =====================================================

        default_hotels_from_file = [
            ('26 july appartements', '26.july.apartments@gmail.com'),
            ('Golden jewel ismalia', 'reservation.goldenism@jewelhotels.eg'),
            ('Agouza hotel', 'jewelelagouza@gmail.com'),
            ('Assuit Hotel', 'army.assuitclub@yahoo.com'),
            ('Dokki Hotel', 'reservation.eldokki@jewelhotels.eg'),
            ('Inn Elbakry Hotel', 'jewelinn.elbakry@gmail.com'),
            ('Inn BeniSuef Hotel', 'jewel.hotel.bns@gmail.com'),
            ('Maadi Cabins and Club', 'msamir77777@gmail.com'),
            ('Mamoura Armed Forces', 'mamouraarmedforcec@gmail.com'),
            ('Royal Jewel El-Raml', 'royal.jewel.reservation@gmail.com'),
            ('Asafra Hotel apartements', 'abrag.asafra@gmail.com'),
            ('Minya Compound of the Armed Forces', 'minyaarmyclub@hotmail.com'),
            ('Plaza Hotel', 'msamir77777@gmail.com'),
            ('Beach Matrouh Hotel', 'jewelbeachm@gmail.com'),
            ('Port Said Hotel', 'portsaidarmedforces7@gmail.com'),
            ('Zamalek Hotel', 'jewelalzamalek1800@gmail.com'),
            ('Sharm El Sheikh Hotel', 'RESERVATION.SHARM@jewelhotels.eg'),
            ('Green Mountain Hotel', 'jewel.greenmountain@gmail.com'),
            ('Glorious Hotel', 'montzah.elhlmeya@gmail.com'),
            ('Al Nasr Hotel & Apartments', 'elnasrjewel@gmail.com'),
            ('Fayed Hotel', 'jewelfayed@gmail.com'),
            ('Assiut Hotel', 'army.assuitclub@yahoo.com'),
            ('Ras El Bar Apartments Armed Forces', 'raselbarr.army.hotel@gmail.com'),
            ('Fayoum Hotel Armed Forces', 'fayoumhotel@gmail.com'),
            ('Luxor Hotel', 'jewelluxor3@gmail.com'),
            ('Matrouh Hotel', 'jewelmatrouhhotel@gmail.com'),
            ('Mandara Apartments', 'jewellelmandra@gmail.com'),
            ('El Gameel Hotel', 'jewelhotelelgameel@gmail.com'),
            ('El Obayed Apartments Armed Forces', 'elobayedapartments@gmail.com'),
            ('Fanara Apartments Armed Forces', 'fanararesort20@gmail.com'),
            ('Ajami Hotel Armed Forces Apartments', 'alagamiclub@gmail.com'),
            ('Al-Galaa Club', 'elgalaaclub0@gmail.com'),
            ('Alfustat Hotel', 'Recjewelalfostat@outlook.com'),
            ('plaza banha hotel', 'Fomgr.Benha@jewelhotels.eg'),
            ('Golden Jewel Ismailia', 'reservation.goldenism@jewelhotels.eg'),
            ('JEWEL INN MATROUH', 'jewelmatrouhhotel@gmail.com'),
            ('Maamoura Armed Forces Apartments', 'mamouraarmedforcec@gmail.com'),
        ]

        for hotel_name, hotel_email in default_hotels_from_file:
            result = await session.execute(
                select(Hotel).where(Hotel.name == hotel_name)
            )
            existing_hotel = result.scalar_one_or_none()

            if not existing_hotel:
                session.add(
                    Hotel(
                        name=hotel_name,
                        email=hotel_email,
                        is_active=True,
                    )
                )
            else:
                changed = False
                if hotel_email and existing_hotel.email != hotel_email:
                    existing_hotel.email = hotel_email
                    changed = True
                if not existing_hotel.is_active:
                    existing_hotel.is_active = True
                    changed = True

        await session.flush()

        # =====================================================
        # User Master Data - Room Types from Excel list
        # =====================================================

        default_room_types_from_file = [
            ('Double Room with Sea View', 'DO'),
            ('Classic Double Room with City View', 'CL'),
            ('Classic Double Room with Pool View', 'CL2'),
            ('Deluxe Double Room with City View', 'DE'),
            ('Deluxe Double Room with Pool View', 'DE2'),
            ('Deluxe Suite', 'DE3'),
            ('Double Room', 'DO2'),
            ('Double Room (Egyptians Only)', 'DO3'),
            ('Double Room with Pool View (Egyptians Only)', 'DO4'),
            ('Double or Twin Room with Side Sea View and Garden View', 'DO5'),
            ('Double Room Panoramic Sea View', 'DO6'),
            ('Double Room with City View', 'DO7'),
            ('Double Room with Garden View', 'DO8'),
            ('Double Room with Mountain View', 'DO9'),
            ('Double Room With pool view', 'DO10'),
            ('Family Room', 'FA'),
            ('Family Suite', 'FA2'),
            ('Family Suite with City view', 'FA3'),
            ('Family suite with sea view', 'FA4'),
            ('Five-Double Room', '5B'),
            ('Junior Suite', 'JU'),
            ('Large Double Room with Nile View', 'DO11'),
            ('Royal Suite with Sea View', 'RO'),
            ('Single Room', 'SI'),
            ('Single Room with Sea View', 'SI2'),
            ('Suite with Two Bed Room', 'SU'),
            ('Three Classic Room with city view', '3B'),
            ('Three-Bedroom Apartement with sea view', '3B2'),
            ('Three-Bedroom Apartment', '3B3'),
            ('Three-Bedroom Apartment with Sea View', '3B4'),
            ('Three-Single Room with Garden View', '3B5'),
            ('Triple Room', 'TR'),
            ('Triple Room with City View', 'TR2'),
            ('Triple Room with sea view', 'TR3'),
            ('Triple Room with Side Sea View and Garden View', 'TR4'),
            ('Triple with city City view', 'TR5'),
            ('Two-Bedroom Apartement', '2B'),
            ('Two-Bedroom Apartment Side Sea View', '2B2'),
            ('Two-Bedroom Suite', '2B3'),
            ('Two-Double Room', '2B4'),
            ('Villa', 'VI'),
            ('Single or Double Room', 'SI3'),
            ('One-Bedroom Apartment', 'ON'),
            ('Deluxe Double or Twin Room', 'DE4'),
            ('Junior Suite with Sea View', 'JU2'),
            ('Double Room With Panoramic Sea View', 'DO12'),
        ]

        for room_name, room_code in default_room_types_from_file:
            result = await session.execute(
                select(RoomType).where(RoomType.name == room_name)
            )
            existing_room = result.scalar_one_or_none()

            if not existing_room:
                result = await session.execute(
                    select(RoomType).where(RoomType.code == room_code)
                )
                existing_by_code = result.scalar_one_or_none()
                if existing_by_code:
                    # Do not overwrite an existing master-data code.
                    room_code = None

                session.add(
                    RoomType(
                        name=room_name,
                        code=room_code,
                        is_active=True,
                    )
                )
            else:
                if not existing_room.is_active:
                    existing_room.is_active = True

                # Only assign the default code when it is not already
                # used by another RoomType. This prevents a UNIQUE
                # constraint failure during startup (for example DO).
                if not existing_room.code and room_code:
                    result = await session.execute(
                        select(RoomType).where(
                            RoomType.code == room_code,
                            RoomType.id != existing_room.id,
                        )
                    )
                    existing_by_code = result.scalar_one_or_none()
                    if not existing_by_code:
                        existing_room.code = room_code

        # The Rate Plans remain fixed by business rule.

        # =====================================================
        # Rate Plans
        # =====================================================

        default_rate_plans = [

            (
                "RO",
                "Room Only",
                "Room Only",
            ),

            (
                "B.B",
                "Bed & Breakfast",
                "Breakfast",
            ),

            (
                "H.B",
                "Half Board",
                "Breakfast + Lunch or Dinner",
            ),

            (
                "F.B",
                "Full Board",
                "Breakfast + Lunch + Dinner",
            ),

        ]

        for code, name, meals in default_rate_plans:

            result = await session.execute(

                select(RatePlan).where(
                    RatePlan.code == code
                )

            )

            existing = (
                result.scalar_one_or_none()
            )

            if not existing:

                session.add(
                    RatePlan(
                        code=code,
                        name=name,
                        meals=meals,
                        is_active=True,
                    )
                )

        # =====================================================
        # Nationalities
        # =====================================================

        # Master list supplied by the user (248 nationality codes).
        default_nationalities = [
            ('AX', 'Åland Islands'),
            ('AF', 'Afghanistan'),
            ('AL', 'Albania'),
            ('DZ', 'Algeria'),
            ('AS', 'American Samoa'),
            ('AD', 'Andorra'),
            ('AO', 'Angola'),
            ('AI', 'Anguilla'),
            ('AQ', 'Antarctica'),
            ('AG', 'Antigua and Barbuda'),
            ('AR', 'Argentina'),
            ('AM', 'Armenia'),
            ('AW', 'Aruba'),
            ('AU', 'Australia'),
            ('AT', 'Austria'),
            ('AZ', 'Azerbaijan'),
            ('BS', 'Bahamas'),
            ('BH', 'Bahrain'),
            ('BD', 'Bangladesh'),
            ('BB', 'Barbados'),
            ('BY', 'Belarus'),
            ('BE', 'Belgium'),
            ('BZ', 'Belize'),
            ('BJ', 'Benin'),
            ('BM', 'Bermuda'),
            ('BT', 'Bhutan'),
            ('BO', 'Bolivia'),
            ('BQ', 'Bonaire, Sint Eustatius and Saba'),
            ('BA', 'Bosnia and Herzegovina'),
            ('BW', 'Botswana'),
            ('BV', 'Bouvet Island'),
            ('BR', 'Brazil'),
            ('IO', 'British Indian Ocean Territory'),
            ('BN', 'Brunei Darussalam'),
            ('BG', 'Bulgaria'),
            ('BF', 'Burkina Faso'),
            ('BI', 'Burundi'),
            ('CV', 'Cabo Verde'),
            ('KH', 'Cambodia'),
            ('CM', 'Cameroon'),
            ('CA', 'Canada'),
            ('KY', 'Cayman Islands'),
            ('CF', 'Central African Republic'),
            ('TD', 'Chad'),
            ('CL', 'Chile'),
            ('CN', 'China'),
            ('CX', 'Christmas Island'),
            ('CC', 'Cocos'),
            ('CO', 'Colombia'),
            ('KM', 'Comoros'),
            ('CD', 'Congo'),
            ('CG', 'Congo'),
            ('CK', 'Cook Islands'),
            ('CR', 'Costa Rica'),
            ('HR', 'Croatia'),
            ('CU', 'Cuba'),
            ('CW', 'Curaçao'),
            ('CY', 'Cyprus'),
            ('CZ', 'Czechia'),
            ('CI', "Côte d'Ivoire"),
            ('DK', 'Denmark'),
            ('DJ', 'Djibouti'),
            ('DM', 'Dominica'),
            ('DO', 'Dominican Republic'),
            ('EC', 'Ecuador'),
            ('EG', 'Egypt'),
            ('SV', 'El Salvador'),
            ('GQ', 'Equatorial Guinea'),
            ('ER', 'Eritrea'),
            ('EE', 'Estonia'),
            ('SZ', 'Eswatini'),
            ('ET', 'Ethiopia'),
            ('FK', 'Falkland Islands'),
            ('FO', 'Faroe Islands'),
            ('FJ', 'Fiji'),
            ('FI', 'Finland'),
            ('FR', 'France'),
            ('GF', 'French Guiana'),
            ('PF', 'French Polynesia'),
            ('TF', 'French Southern Territories'),
            ('GA', 'Gabon'),
            ('GM', 'Gambia'),
            ('GE', 'Georgia'),
            ('DE', 'Germany'),
            ('GH', 'Ghana'),
            ('GI', 'Gibraltar'),
            ('GR', 'Greece'),
            ('GL', 'Greenland'),
            ('GD', 'Grenada'),
            ('GP', 'Guadeloupe'),
            ('GU', 'Guam'),
            ('GT', 'Guatemala'),
            ('GG', 'Guernsey'),
            ('GN', 'Guinea'),
            ('GW', 'Guinea-Bissau'),
            ('GY', 'Guyana'),
            ('HT', 'Haiti'),
            ('HM', 'Heard Island and McDonald Islands'),
            ('VA', 'Holy See'),
            ('HN', 'Honduras'),
            ('HK', 'Hong Kong'),
            ('HU', 'Hungary'),
            ('IS', 'Iceland'),
            ('IN', 'India'),
            ('ID', 'Indonesia'),
            ('IR', 'Iran'),
            ('IQ', 'Iraq'),
            ('IE', 'Ireland'),
            ('IM', 'Isle of Man'),
            ('IL', 'Israel'),
            ('IT', 'Italy'),
            ('JM', 'Jamaica'),
            ('JP', 'Japan'),
            ('JE', 'Jersey'),
            ('JO', 'Jordan'),
            ('KZ', 'Kazakhstan'),
            ('KE', 'Kenya'),
            ('KI', 'Kiribati'),
            ('KP', 'Korea'),
            ('KR', 'Korea'),
            ('KW', 'Kuwait'),
            ('KG', 'Kyrgyzstan'),
            ('LA', "Lao People's Democratic"),
            ('LV', 'Latvia'),
            ('LB', 'Lebanon'),
            ('LS', 'Lesotho'),
            ('LR', 'Liberia'),
            ('LY', 'Libya'),
            ('LI', 'Liechtenstein'),
            ('LT', 'Lithuania'),
            ('LU', 'Luxembourg'),
            ('MO', 'Macao'),
            ('MG', 'Madagascar'),
            ('MW', 'Malawi'),
            ('MY', 'Malaysia'),
            ('MV', 'Maldives'),
            ('ML', 'Mali'),
            ('MT', 'Malta'),
            ('MH', 'Marshall Islands'),
            ('MQ', 'Martinique'),
            ('MR', 'Mauritania'),
            ('MU', 'Mauritius'),
            ('YT', 'Mayotte'),
            ('MX', 'Mexico'),
            ('FM', 'Micronesia'),
            ('MD', 'Moldova'),
            ('MC', 'Monaco'),
            ('MN', 'Mongolia'),
            ('ME', 'Montenegro'),
            ('MS', 'Montserrat'),
            ('MA', 'Morocco'),
            ('MZ', 'Mozambique'),
            ('MM', 'Myanmar'),
            ('NA', 'Namibia'),
            ('NR', 'Nauru'),
            ('NP', 'Nepal'),
            ('NL', 'Netherlands'),
            ('NC', 'New Caledonia'),
            ('NZ', 'New Zealand'),
            ('NI', 'Nicaragua'),
            ('NE', 'Niger'),
            ('NG', 'Nigeria'),
            ('NU', 'Niue'),
            ('NF', 'Norfolk Island'),
            ('MP', 'Northern Mariana Islands'),
            ('NO', 'Norway'),
            ('OM', 'Oman'),
            ('PK', 'Pakistan'),
            ('PW', 'Palau'),
            ('PS', 'Palestine'),
            ('PA', 'Panama'),
            ('PG', 'Papua New Guinea'),
            ('PY', 'Paraguay'),
            ('PE', 'Peru'),
            ('PH', 'Philippines'),
            ('PN', 'Pitcairn'),
            ('PL', 'Poland'),
            ('PT', 'Portugal'),
            ('PR', 'Puerto Rico'),
            ('QA', 'Qatar'),
            ('MK', 'Republic of North Macedonia'),
            ('RO', 'Romania'),
            ('RU', 'Russian Federation'),
            ('RW', 'Rwanda'),
            ('RE', 'Réunion'),
            ('BL', 'Saint Barthélemy'),
            ('SH', 'Saint Helena, Ascension and Tristan da Cunha'),
            ('KN', 'Saint Kitts and Nevis'),
            ('LC', 'Saint Lucia'),
            ('MF', 'Saint Martin'),
            ('PM', 'Saint Pierre and Miquelon'),
            ('VC', 'Saint Vincent and the Grenadines'),
            ('WS', 'Samoa'),
            ('SM', 'San Marino'),
            ('ST', 'Sao Tome and Principe'),
            ('SA', 'Saudi Arabia'),
            ('SN', 'Senegal'),
            ('RS', 'Serbia'),
            ('SC', 'Seychelles'),
            ('SL', 'Sierra Leone'),
            ('SG', 'Singapore'),
            ('SX', 'Sint Maarten'),
            ('SK', 'Slovakia'),
            ('SI', 'Slovenia'),
            ('SB', 'Solomon Islands'),
            ('SO', 'Somalia'),
            ('ZA', 'South Africa'),
            ('GS', 'South Georgia and the South Sandwich Islands'),
            ('SS', 'South Sudan'),
            ('ES', 'Spain'),
            ('LK', 'Sri Lanka'),
            ('SD', 'Sudan'),
            ('SR', 'Suriname'),
            ('SJ', 'Svalbard and Jan Mayen'),
            ('SE', 'Sweden'),
            ('CH', 'Switzerland'),
            ('SY', 'Syrian Arab'),
            ('TW', 'Taiwan'),
            ('TJ', 'Tajikistan'),
            ('TZ', 'Tanzania'),
            ('TH', 'Thailand'),
            ('TL', 'Timor-Leste'),
            ('TG', 'Togo'),
            ('TK', 'Tokelau'),
            ('TO', 'Tonga'),
            ('TT', 'Trinidad and Tobago'),
            ('TN', 'Tunisia'),
            ('TR', 'Turkey'),
            ('TM', 'Turkmenistan'),
            ('TC', 'Turks and Caicos Islands'),
            ('TV', 'Tuvalu'),
            ('UG', 'Uganda'),
            ('UA', 'Ukraine'),
            ('AE', 'United Arab Emirates'),
            ('GB', 'United Kingdom'),
            ('US', 'United States'),
            ('UY', 'Uruguay'),
            ('UZ', 'Uzbekistan'),
            ('VU', 'Vanuatu'),
            ('VE', 'Venezuela'),
            ('VN', 'Vietnam'),
            ('VG', 'Virgin Islands'),
            ('VI', 'Virgin Islands'),
            ('WF', 'Wallis and Futuna'),
            ('EH', 'Western Sahara'),
            ('YE', 'Yemen'),
            ('ZM', 'Zambia'),
            ('ZW', 'Zimbabwe'),
        ]

        for nationality_code, nationality_name in default_nationalities:
            result = await session.execute(
                select(Nationality).where(
                    Nationality.code == nationality_code
                )
            )

            existing_nationality = (
                result.scalar_one_or_none()
            )

            if not existing_nationality:
                session.add(
                    Nationality(
                        code=nationality_code,
                        name=nationality_name,
                        is_active=True,
                    )
                )
            else:
                # Keep the user's master-data spelling authoritative.
                if existing_nationality.name != nationality_name:
                    existing_nationality.name = nationality_name

        # =====================================================
        # Guest Count Options
        # =====================================================

        default_guest_options = []

        for adults in range(1, 11):
            default_guest_options.append(
                (
                    adults,
                    0,
                    f"{adults}A",
                    f"{adults} Adults",
                )
            )

            for children in range(1, 6):
                child_label = (
                    "Child"
                    if children == 1
                    else "Children"
                )

                default_guest_options.append(
                    (
                        adults,
                        children,
                        f"{adults}A{children}C",
                        f"{adults} Adults + {children} {child_label}",
                    )
                )

        for adults, children, code, label in default_guest_options:

            result = await session.execute(
                select(GuestCountOption).where(
                    GuestCountOption.code == code
                )
            )

            existing_option = (
                result.scalar_one_or_none()
            )

            if not existing_option:
                session.add(
                    GuestCountOption(
                        adults=adults,
                        children=children,
                        code=code,
                        label=label,
                        is_active=True,
                    )
                )

        await session.commit()


# =========================================================
# Startup
# =========================================================

@app.on_event("startup")
async def startup_event():

    # ---------------------------------------------------------
    # Create missing tables
    # ---------------------------------------------------------

    async with engine.begin() as conn:

        await conn.run_sync(
            Base.metadata.create_all
        )

    # ---------------------------------------------------------
    # Ensure the email settings record exists
    # ---------------------------------------------------------

    # ---------------------------------------------------------
    # Migrate existing database
    # ---------------------------------------------------------

    await migrate_database()

    # ---------------------------------------------------------
    # License System
    # ---------------------------------------------------------

    await ensure_license_tables()

    # ---------------------------------------------------------
    # Default Data
    # ---------------------------------------------------------

    await seed_default_data()


# =========================================================
# Root
# =========================================================

@app.get("/")
async def root():

    return {

        "message":
            "Hotel Reservation System API is running",

        "status":
            "ok",

    }


# =========================================================
# Database Test
# =========================================================

@app.get("/database-test")
async def database_test():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(1))
        value = result.scalar_one()
        return {
            "success": True,
            "message": "Database connection successful",
            "value": value,
        }


# =========================================================
# Hotels
# =========================================================

@app.get("/hotels")
async def get_hotels():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Hotel).order_by(
                Hotel.id.desc()
            )
        )

        hotels = result.scalars().all()

        return [
            await serialize_hotel(
                session,
                hotel,
            )
            for hotel in hotels
        ]


# =========================================================
# Create Hotel
# =========================================================

@app.post("/hotels")
async def create_hotel(
    data: HotelCreate,
):
    name = data.name.strip()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Hotel name is required",
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Hotel).where(
                Hotel.name == name
            )
        )

        existing_hotel = (
            result.scalar_one_or_none()
        )

        if existing_hotel:
            raise HTTPException(
                status_code=409,
                detail="Hotel already exists",
            )

        hotel = Hotel(
            name=name,
            email=data.email.strip() if data.email else None,
            phone=data.phone.strip() if data.phone else None,
            address=data.address.strip() if data.address else None,
            is_active=data.is_active,
        )

        session.add(hotel)

        await session.commit()
        await session.refresh(hotel)

        return {
            "success": True,
            "message": "Hotel added successfully",
            "hotel": await serialize_hotel(
                session,
                hotel,
            ),
        }


# =========================================================
# Hotel Details / Update
# =========================================================

# =========================================================
# Hotel Details / Update
# =========================================================

class HotelUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None


@app.get("/hotels/{hotel_id}")
async def get_hotel(hotel_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Hotel).where(
                Hotel.id == hotel_id
            )
        )

        hotel = result.scalar_one_or_none()

        if not hotel:
            raise HTTPException(
                status_code=404,
                detail="Hotel not found",
            )

        return await serialize_hotel(
            session,
            hotel,
        )


@app.patch("/hotels/{hotel_id}")
async def update_hotel(
    hotel_id: int,
    data: HotelUpdate,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Hotel).where(
                Hotel.id == hotel_id
            )
        )

        hotel = result.scalar_one_or_none()

        if not hotel:
            raise HTTPException(
                status_code=404,
                detail="Hotel not found",
            )

        if data.name is not None:
            name = data.name.strip()

            if not name:
                raise HTTPException(
                    status_code=400,
                    detail="Hotel name cannot be empty",
                )

            duplicate = await session.execute(
                select(Hotel).where(
                    Hotel.name == name,
                    Hotel.id != hotel_id,
                )
            )

            if duplicate.scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail="Hotel already exists",
                )

            hotel.name = name

        if data.email is not None:
            hotel.email = data.email.strip() or None

        if data.phone is not None:
            hotel.phone = data.phone.strip() or None

        if data.address is not None:
            hotel.address = data.address.strip() or None

        if data.is_active is not None:
            hotel.is_active = data.is_active

        await session.commit()
        await session.refresh(hotel)

        return {
            "success": True,
            "message": "Hotel updated successfully",
            "hotel": await serialize_hotel(
                session,
                hotel,
            ),
        }


# =========================================================
# Hotel Attachments
# =========================================================

@app.get("/hotels/{hotel_id}/attachments")
async def get_hotel_attachments(hotel_id: int):
    async with AsyncSessionLocal() as session:
        hotel_result = await session.execute(
            select(Hotel).where(
                Hotel.id == hotel_id
            )
        )

        if not hotel_result.scalar_one_or_none():
            raise HTTPException(
                status_code=404,
                detail="Hotel not found",
            )

        result = await session.execute(
            select(HotelAttachment)
            .where(
                HotelAttachment.hotel_id == hotel_id
            )
            .order_by(
                HotelAttachment.id.desc()
            )
        )

        return [
            serialize_hotel_attachment(item)
            for item in result.scalars().all()
        ]


@app.post("/hotels/{hotel_id}/attachments")
async def upload_hotel_attachments(
    hotel_id: int,
    files: list[UploadFile] = File(...),
):
    if not files:
        raise HTTPException(
            status_code=400,
            detail="At least one file is required",
        )

    async with AsyncSessionLocal() as session:
        hotel_result = await session.execute(
            select(Hotel).where(
                Hotel.id == hotel_id
            )
        )

        hotel = hotel_result.scalar_one_or_none()

        if not hotel:
            raise HTTPException(
                status_code=404,
                detail="Hotel not found",
            )

        hotel_dir = HOTEL_FILES_DIR / str(hotel_id)
        hotel_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        created_attachments = []

        for upload in files:
            content_type = (
                upload.content_type or ""
            ).lower().strip()

            is_image = content_type.startswith(
                HOTEL_IMAGE_PREFIX
            )
            is_pdf = content_type == "application/pdf"

            if not (is_image or is_pdf):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Unsupported file type for "
                        f"{upload.filename or 'unnamed file'}. "
                        "Only image files and PDF are allowed."
                    ),
                )

            file_bytes = await upload.read()

            if not file_bytes:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{upload.filename or 'File'} is empty."
                    ),
                )

            if len(file_bytes) > MAX_HOTEL_FILE_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{upload.filename or 'File'} exceeds "
                        "the 25MB limit."
                    ),
                )

            original_name = (
                upload.filename or "hotel-file"
            )

            safe_stem = Path(
                original_name
            ).stem.strip()

            if not safe_stem:
                safe_stem = "hotel-file"

            extension = Path(
                original_name
            ).suffix.lower()

            safe_stem = "".join(
                character
                if (
                    character.isalnum()
                    or character in "-_"
                )
                else "_"
                for character in safe_stem
            )

            stored_name = (
                f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
                f"_{secrets.token_hex(4)}"
                f"_{safe_stem}{extension}"
            )

            target = hotel_dir / stored_name
            target.write_bytes(file_bytes)

            attachment = HotelAttachment(
                hotel_id=hotel_id,
                original_filename=original_name,
                stored_filename=stored_name,
                content_type=content_type,
                file_size=len(file_bytes),
            )

            session.add(attachment)
            created_attachments.append(
                attachment
            )

        await session.commit()

        for attachment in created_attachments:
            await session.refresh(
                attachment
            )

        return {
            "success": True,
            "message": (
                f"{len(created_attachments)} "
                "file(s) uploaded successfully"
            ),
            "attachments": [
                serialize_hotel_attachment(
                    attachment
                )
                for attachment in created_attachments
            ],
        }


@app.delete(
    "/hotels/{hotel_id}/attachments/{attachment_id}"
)
async def delete_hotel_attachment(
    hotel_id: int,
    attachment_id: int,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(HotelAttachment).where(
                HotelAttachment.id == attachment_id,
                HotelAttachment.hotel_id == hotel_id,
            )
        )

        attachment = result.scalar_one_or_none()

        if not attachment:
            raise HTTPException(
                status_code=404,
                detail="Hotel attachment not found",
            )

        file_path = (
            HOTEL_FILES_DIR
            / str(hotel_id)
            / attachment.stored_filename
        )

        if file_path.exists():
            try:
                file_path.unlink()
            except OSError:
                pass

        await session.delete(attachment)
        await session.commit()

        return {
            "success": True,
            "message": "Hotel attachment deleted successfully",
            "attachment_id": attachment_id,
        }


# =========================================================
# Room Types
# =========================================================

@app.get("/room-types")
async def get_room_types():

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(RoomType)

            .where(
                RoomType.is_active == True
            )

            .order_by(
                RoomType.id
            )

        )

        room_types = result.scalars().all()

        return [

            {

                "id":
                    room.id,

                "name":
                    room.name,

                "code":
                    room.code,

                "is_active":
                    room.is_active,

                "created_at":
                    room.created_at,

            }

            for room in room_types

        ]


# =========================================================
# Create Room Type
# =========================================================

@app.post("/room-types")
async def create_room_type(
    data: RoomTypeCreate
):

    name = data.name.strip()
    code = (
        data.code.strip().upper()
        if data.code
        else None
    )

    if not name:

        raise HTTPException(
            status_code=400,
            detail="Room type name is required",
        )

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(RoomType).where(
                RoomType.name == name
            )

        )

        existing = (
            result.scalar_one_or_none()
        )

        if existing:

            raise HTTPException(
                status_code=409,
                detail="Room type already exists",
            )

        if code:
            code_result = await session.execute(
                select(RoomType).where(
                    RoomType.code == code
                )
            )

            if code_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail="Room type code already exists",
                )

        room_type = RoomType(

            name=name,

            code=code,

            is_active=data.is_active,

        )

        session.add(room_type)

        await session.commit()

        await session.refresh(room_type)

        return {

            "success":
                True,

            "message":
                "Room type added successfully",

            "room_type": {

                "id":
                    room_type.id,

                "name":
                    room_type.name,

                "code":
                    room_type.code,

                "is_active":
                    room_type.is_active,

                "created_at":
                    room_type.created_at,

            },

        }


# =========================================================
# Nationalities
# =========================================================

@app.get("/nationalities")
async def get_nationalities(q: str | None = None):
    from sqlalchemy import or_

    async with AsyncSessionLocal() as session:
        query = select(Nationality).where(
            Nationality.is_active == True
        )

        search_value = (q or "").strip()

        if search_value:
            pattern = f"%{search_value}%"
            query = query.where(
                or_(
                    Nationality.code.ilike(pattern),
                    Nationality.name.ilike(pattern),
                )
            )

        result = await session.execute(
            query.order_by(Nationality.name)
        )

        return [
            {
                "id": item.id,
                "code": item.code,
                "name": item.name,
                "is_active": item.is_active,
                "created_at": item.created_at,
            }
            for item in result.scalars().all()
        ]


@app.post("/nationalities")
async def create_nationality(data: NationalityCreate):
    code = data.code.strip().upper()
    name = data.name.strip()

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Nationality code is required",
        )

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Nationality name is required",
        )

    async with AsyncSessionLocal() as session:
        existing = await session.execute(
            select(Nationality).where(
                Nationality.code == code
            )
        )

        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="Nationality code already exists",
            )

        nationality = Nationality(
            code=code,
            name=name,
            is_active=data.is_active,
        )

        session.add(nationality)
        await session.commit()
        await session.refresh(nationality)

        return {
            "success": True,
            "message": "Nationality added successfully",
            "nationality": {
                "id": nationality.id,
                "code": nationality.code,
                "name": nationality.name,
                "is_active": nationality.is_active,
                "created_at": nationality.created_at,
            },
        }


@app.patch("/nationalities/{nationality_id}")
async def update_nationality(
    nationality_id: int,
    data: NationalityUpdate,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Nationality).where(
                Nationality.id == nationality_id
            )
        )

        nationality = result.scalar_one_or_none()

        if not nationality:
            raise HTTPException(
                status_code=404,
                detail="Nationality not found",
            )

        if data.code is not None:
            code = data.code.strip().upper()

            if not code:
                raise HTTPException(
                    status_code=400,
                    detail="Nationality code cannot be empty",
                )

            duplicate = await session.execute(
                select(Nationality).where(
                    Nationality.code == code,
                    Nationality.id != nationality_id,
                )
            )

            if duplicate.scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail="Nationality code already exists",
                )

            nationality.code = code

        if data.name is not None:
            name = data.name.strip()

            if not name:
                raise HTTPException(
                    status_code=400,
                    detail="Nationality name cannot be empty",
                )

            nationality.name = name

        if data.is_active is not None:
            nationality.is_active = data.is_active

        await session.commit()
        await session.refresh(nationality)

        return {
            "success": True,
            "message": "Nationality updated successfully",
            "nationality": {
                "id": nationality.id,
                "code": nationality.code,
                "name": nationality.name,
                "is_active": nationality.is_active,
                "created_at": nationality.created_at,
            },
        }


# =========================================================
# Room Types - Search / Update
# =========================================================

@app.get("/room-types/search")
async def search_room_types(q: str | None = None):
    from sqlalchemy import or_

    async with AsyncSessionLocal() as session:
        query = select(RoomType).where(
            RoomType.is_active == True
        )

        search_value = (q or "").strip()

        if search_value:
            pattern = f"%{search_value}%"
            query = query.where(
                or_(
                    RoomType.name.ilike(pattern),
                    RoomType.code.ilike(pattern),
                )
            )

        result = await session.execute(
            query.order_by(RoomType.name)
        )

        return [
            {
                "id": room.id,
                "name": room.name,
                "code": room.code,
                "is_active": room.is_active,
                "created_at": room.created_at,
            }
            for room in result.scalars().all()
        ]


@app.patch("/room-types/{room_type_id}")
async def update_room_type(
    room_type_id: int,
    data: RoomTypeUpdate,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(RoomType).where(
                RoomType.id == room_type_id
            )
        )

        room_type = result.scalar_one_or_none()

        if not room_type:
            raise HTTPException(
                status_code=404,
                detail="Room type not found",
            )

        if data.name is not None:
            name = data.name.strip()

            if not name:
                raise HTTPException(
                    status_code=400,
                    detail="Room type name cannot be empty",
                )

            duplicate = await session.execute(
                select(RoomType).where(
                    RoomType.name == name,
                    RoomType.id != room_type_id,
                )
            )

            if duplicate.scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail="Room type already exists",
                )

            room_type.name = name

        if data.code is not None:
            code = data.code.strip().upper() or None

            if code:
                duplicate = await session.execute(
                    select(RoomType).where(
                        RoomType.code == code,
                        RoomType.id != room_type_id,
                    )
                )

                if duplicate.scalar_one_or_none():
                    raise HTTPException(
                        status_code=409,
                        detail="Room type code already exists",
                    )

            room_type.code = code

        if data.is_active is not None:
            room_type.is_active = data.is_active

        await session.commit()
        await session.refresh(room_type)

        return {
            "success": True,
            "message": "Room type updated successfully",
            "room_type": {
                "id": room_type.id,
                "name": room_type.name,
                "code": room_type.code,
                "is_active": room_type.is_active,
                "created_at": room_type.created_at,
            },
        }


# =========================================================
# Guest Count Options
# =========================================================

@app.get("/guest-count-options")
async def get_guest_count_options(q: str | None = None):
    from sqlalchemy import or_

    async with AsyncSessionLocal() as session:
        query = select(GuestCountOption).where(
            GuestCountOption.is_active == True
        )

        search_value = (q or "").strip()

        if search_value:
            pattern = f"%{search_value}%"
            query = query.where(
                or_(
                    GuestCountOption.code.ilike(pattern),
                    GuestCountOption.label.ilike(pattern),
                )
            )

        result = await session.execute(
            query.order_by(
                GuestCountOption.adults,
                GuestCountOption.children,
            )
        )

        return [
            {
                "id": item.id,
                "adults": item.adults,
                "children": item.children,
                "code": item.code,
                "label": item.label,
                "is_active": item.is_active,
                "created_at": item.created_at,
            }
            for item in result.scalars().all()
        ]


@app.post("/guest-count-options")
async def create_guest_count_option(
    data: GuestCountOptionCreate,
):
    if data.adults < 1:
        raise HTTPException(
            status_code=400,
            detail="Adults must be at least 1",
        )

    if data.children < 0:
        raise HTTPException(
            status_code=400,
            detail="Children cannot be negative",
        )

    code = (
        data.code.strip().upper()
        if data.code
        else f"{data.adults}A{data.children}C"
    )

    label = (
        data.label.strip()
        if data.label
        else (
            f"{data.adults} Adults"
            if data.children == 0
            else (
                f"{data.adults} Adults + "
                f"{data.children} "
                f"{'Child' if data.children == 1 else 'Children'}"
            )
        )
    )

    async with AsyncSessionLocal() as session:
        existing = await session.execute(
            select(GuestCountOption).where(
                GuestCountOption.code == code
            )
        )

        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="Guest count option already exists",
            )

        option = GuestCountOption(
            adults=data.adults,
            children=data.children,
            code=code,
            label=label,
            is_active=data.is_active,
        )

        session.add(option)
        await session.commit()
        await session.refresh(option)

        return {
            "success": True,
            "message": "Guest count option added successfully",
            "option": {
                "id": option.id,
                "adults": option.adults,
                "children": option.children,
                "code": option.code,
                "label": option.label,
                "is_active": option.is_active,
                "created_at": option.created_at,
            },
        }


@app.patch("/guest-count-options/{option_id}")
async def update_guest_count_option(
    option_id: int,
    data: GuestCountOptionUpdate,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GuestCountOption).where(
                GuestCountOption.id == option_id
            )
        )

        option = result.scalar_one_or_none()

        if not option:
            raise HTTPException(
                status_code=404,
                detail="Guest count option not found",
            )

        if data.adults is not None:
            if data.adults < 1:
                raise HTTPException(
                    status_code=400,
                    detail="Adults must be at least 1",
                )
            option.adults = data.adults

        if data.children is not None:
            if data.children < 0:
                raise HTTPException(
                    status_code=400,
                    detail="Children cannot be negative",
                )
            option.children = data.children

        if data.code is not None:
            code = data.code.strip().upper()

            if not code:
                raise HTTPException(
                    status_code=400,
                    detail="Guest count option code cannot be empty",
                )

            duplicate = await session.execute(
                select(GuestCountOption).where(
                    GuestCountOption.code == code,
                    GuestCountOption.id != option_id,
                )
            )

            if duplicate.scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail="Guest count option already exists",
                )

            option.code = code

        if data.label is not None:
            label = data.label.strip()

            if not label:
                raise HTTPException(
                    status_code=400,
                    detail="Guest count option label cannot be empty",
                )

            option.label = label

        if data.is_active is not None:
            option.is_active = data.is_active

        await session.commit()
        await session.refresh(option)

        return {
            "success": True,
            "message": "Guest count option updated successfully",
            "option": {
                "id": option.id,
                "adults": option.adults,
                "children": option.children,
                "code": option.code,
                "label": option.label,
                "is_active": option.is_active,
                "created_at": option.created_at,
            },
        }


# =========================================================
# Rate Plans
# =========================================================

@app.get("/rate-plans")
async def get_rate_plans():

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(RatePlan)

            .where(
                RatePlan.is_active == True
            )

            .order_by(
                RatePlan.id
            )

        )

        rate_plans = result.scalars().all()

        return [

            {

                "id":
                    rate_plan.id,

                "code":
                    rate_plan.code,

                "name":
                    rate_plan.name,

                "meals":
                    rate_plan.meals,

                "is_active":
                    rate_plan.is_active,

                "created_at":
                    rate_plan.created_at,

            }

            for rate_plan in rate_plans

        ]


# =========================================================
# Create Rate Plan
# =========================================================

@app.post("/rate-plans")
async def create_rate_plan(
    data: RatePlanCreate
):

    code = data.code.strip().upper()

    name = data.name.strip()

    if not code:

        raise HTTPException(
            status_code=400,
            detail="Rate plan code is required",
        )

    if not name:

        raise HTTPException(
            status_code=400,
            detail="Rate plan name is required",
        )

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(RatePlan).where(
                RatePlan.code == code
            )

        )

        existing = (
            result.scalar_one_or_none()
        )

        if existing:

            raise HTTPException(
                status_code=409,
                detail="Rate Plan already exists",
            )

        rate_plan = RatePlan(

            code=code,

            name=name,

            meals=data.meals,

            is_active=data.is_active,

        )

        session.add(rate_plan)

        await session.commit()

        await session.refresh(rate_plan)

        return {

            "success":
                True,

            "message":
                "Rate Plan added successfully",

            "rate_plan": {

                "id":
                    rate_plan.id,

                "code":
                    rate_plan.code,

                "name":
                    rate_plan.name,

                "meals":
                    rate_plan.meals,

                "is_active":
                    rate_plan.is_active,

                "created_at":
                    rate_plan.created_at,

            },

        }


# =========================================================
# Get Reservation
# =========================================================

@app.get(
    "/reservation/{booking_number}"
)
async def get_reservation(
    booking_number: str
):

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(Reservation)

            .options(

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.room_type
                ),

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.rate_plan
                ),

                selectinload(
                    Reservation.hotel
                ),

            )

            .where(
                Reservation.booking_number
                == booking_number
            )

        )

        reservation = (
            result.scalar_one_or_none()
        )

        if not reservation:

            raise HTTPException(
                status_code=404,
                detail="Reservation not found",
            )

        return serialize_reservation(
            reservation
        )


# =========================================================
# Get All Reservations
# =========================================================

@app.get("/reservations")
async def get_reservations():

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(Reservation)

            .options(

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.room_type
                ),

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.rate_plan
                ),

                selectinload(
                    Reservation.hotel
                ),

            )

            .order_by(
                Reservation.id.desc()
            )

        )

        reservations = (
            result.scalars().all()
        )

        return [

            serialize_reservation(
                reservation
            )

            for reservation in reservations

        ]


# =========================================================
# Payment Receipt
# =========================================================

@app.post("/reservation/{booking_number}/payment-receipt")
async def upload_payment_receipt(
    booking_number: str,
    last4: str = Form(...),
    receipt: UploadFile = File(...),
):
    last4 = last4.strip()

    if not last4.isdigit() or len(last4) != 4:
        raise HTTPException(
            status_code=400,
            detail="The last 4 digits must contain exactly 4 digits.",
        )

    content_type = (receipt.content_type or "").lower()

    if content_type not in ALLOWED_RECEIPT_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported receipt image type. Use JPG, PNG, or WEBP.",
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Reservation).where(
                Reservation.booking_number == booking_number
            )
        )

        reservation = result.scalar_one_or_none()

        if not reservation:
            raise HTTPException(
                status_code=404,
                detail="Reservation not found",
            )

        file_bytes = await receipt.read()

        if not file_bytes:
            raise HTTPException(
                status_code=400,
                detail="Receipt image is empty.",
            )

        if len(file_bytes) > PAYMENT_RECEIPT_MAX_BYTES:
            raise HTTPException(
                status_code=400,
                detail="Receipt image size must not exceed 10MB.",
            )

        extension_map = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
        }

        extension = extension_map[content_type]

        if reservation.payment_receipt_path:
            old_file = (
                PAYMENT_RECEIPTS_DIR
                / reservation.payment_receipt_path
            )

            if old_file.exists():
                try:
                    old_file.unlink()
                except OSError:
                    pass

        safe_booking = "".join(
            character
            if character.isalnum() or character in "-_"
            else "_"
            for character in reservation.booking_number
        )

        filename = (
            f"{safe_booking}_"
            f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
            f"{extension}"
        )

        file_path = PAYMENT_RECEIPTS_DIR / filename
        file_path.write_bytes(file_bytes)

        reservation.payment_receipt_path = filename
        reservation.payment_receipt_last4 = last4

        await session.commit()
        await session.refresh(reservation)

        return {
            "success": True,
            "message": "Payment receipt saved successfully",
            "booking_number": reservation.booking_number,
            "payment_receipt_last4": reservation.payment_receipt_last4,
            "payment_receipt_path": reservation.payment_receipt_path,
            "payment_receipt_url": (
                f"/uploads/payment-receipts/{filename}"
            ),
        }


@app.delete("/reservation/{booking_number}/payment-receipt")
async def delete_payment_receipt(booking_number: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Reservation).where(
                Reservation.booking_number == booking_number
            )
        )

        reservation = result.scalar_one_or_none()

        if not reservation:
            raise HTTPException(
                status_code=404,
                detail="Reservation not found",
            )

        if reservation.payment_receipt_path:
            file_path = (
                PAYMENT_RECEIPTS_DIR
                / reservation.payment_receipt_path
            )

            if file_path.exists():
                try:
                    file_path.unlink()
                except OSError:
                    pass

        reservation.payment_receipt_path = None
        reservation.payment_receipt_last4 = None

        await session.commit()

        return {
            "success": True,
            "message": "Payment receipt deleted successfully",
            "booking_number": reservation.booking_number,
        }


# =========================================================
# Create Reservation
# =========================================================

@app.post("/reservations")
async def create_reservation(
    data: ReservationCreate
):

    # =====================================================
    # Booking Number
    # =====================================================

    booking_number = (
        data.booking_number.strip()
    )

    if not booking_number:

        raise HTTPException(
            status_code=400,
            detail="Booking number is required",
        )

    # =====================================================
    # Guests
    # =====================================================

    adult_count = (
        data.adult_count
        if data.adult_count is not None
        else (data.total_guest or 0)
    )

    child_count = (
        data.child_count
        if data.child_count is not None
        else 0
    )

    if adult_count < 0 or child_count < 0:
        raise HTTPException(
            status_code=400,
            detail="Adult and child counts cannot be negative",
        )

    if adult_count + child_count < 1:
        raise HTTPException(
            status_code=400,
            detail="At least one guest is required",
        )

    # =====================================================
    # Rooms
    # =====================================================

    if not data.rooms:

        raise HTTPException(
            status_code=400,
            detail="At least one room is required",
        )

    # =====================================================
    # Dates
    # =====================================================

    if not data.check_in:

        raise HTTPException(
            status_code=400,
            detail="Check-in date is required",
        )

    if not data.check_out:

        raise HTTPException(
            status_code=400,
            detail="Check-out date is required",
        )

    if data.check_out <= data.check_in:

        raise HTTPException(
            status_code=400,
            detail="Check-out date must be after check-in date",
        )

    nights = (
        data.check_out - data.check_in
    ).days

    if nights < 1:

        raise HTTPException(
            status_code=400,
            detail="Invalid number of nights",
        )

    # =====================================================
    # Payment Type
    # =====================================================

    if (
        data.payment_type
        and data.payment_type
        not in ALLOWED_PAYMENT_TYPES
    ):

        raise HTTPException(
            status_code=400,
            detail="Invalid payment type",
        )

    # =====================================================
    # Cash
    # =====================================================

    is_cash = is_cash_payment(
        data.payment_type
    )

    if is_cash:

        if (
            data.exchange_rate is None
            or data.exchange_rate <= 0
        ):

            raise HTTPException(
                status_code=400,
                detail="Cash exchange rate is required",
            )

    # =====================================================
    # Database
    # =====================================================

    async with AsyncSessionLocal() as session:

        # =================================================
        # Duplicate Booking
        # =================================================

        result = await session.execute(

            select(Reservation).where(
                Reservation.booking_number
                == booking_number
            )

        )

        existing_reservation = (
            result.scalar_one_or_none()
        )

        if existing_reservation:

            raise HTTPException(
                status_code=409,
                detail="Booking number already exists",
            )

        # =================================================
        # Validate Hotel
        # =================================================

        hotel = None

        if data.hotel_id is not None:

            hotel_result = await session.execute(

                select(Hotel).where(
                    Hotel.id == data.hotel_id
                )

            )

            hotel = (
                hotel_result.scalar_one_or_none()
            )

            if not hotel:

                raise HTTPException(
                    status_code=404,
                    detail="Selected hotel not found",
                )

            if not hotel.is_active:

                raise HTTPException(
                    status_code=400,
                    detail="Selected hotel is inactive",
                )

        # =================================================
        # Validate & Calculate Rooms
        # =================================================

        prepared_rooms = []

        total_price_usd = 0.0

        for index, room_data in enumerate(
            data.rooms,
            start=1
        ):

            # ---------------------------------------------
            # Room Type
            # ---------------------------------------------

            room_type_result = await session.execute(

                select(RoomType).where(
                    RoomType.id
                    == room_data.room_type_id
                )

            )

            room_type = (
                room_type_result.scalar_one_or_none()
            )

            if not room_type:

                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Room type {index} not found"
                    ),
                )

            if not room_type.is_active:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Room type {index} is inactive"
                    ),
                )

            # ---------------------------------------------
            # Rate Plan
            # ---------------------------------------------

            rate_plan_result = await session.execute(

                select(RatePlan).where(
                    RatePlan.id
                    == room_data.rate_plan_id
                )

            )

            rate_plan = (
                rate_plan_result.scalar_one_or_none()
            )

            if not rate_plan:

                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Rate Plan for room {index} not found"
                    ),
                )

            if not rate_plan.is_active:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Rate Plan for room {index} is inactive"
                    ),
                )

            # ---------------------------------------------
            # Price
            # ---------------------------------------------

            if room_data.total_price_usd < 0:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Room {index} price "
                        "cannot be negative"
                    ),
                )

            # ---------------------------------------------
            # Nightly USD
            # ---------------------------------------------

            nightly_rate_usd = (
                room_data.total_price_usd
                / nights
            )

            # ---------------------------------------------
            # EGP
            # ---------------------------------------------

            room_total_egp = None

            room_nightly_egp = None

            if is_cash:

                room_total_egp = (
                    room_data.total_price_usd
                    * data.exchange_rate
                )

                room_nightly_egp = (
                    nightly_rate_usd
                    * data.exchange_rate
                )

            # ---------------------------------------------
            # Total USD
            # ---------------------------------------------

            total_price_usd += (
                room_data.total_price_usd
            )

            # ---------------------------------------------
            # Prepare
            # ---------------------------------------------

            prepared_rooms.append({

                "room_type":
                    room_type,

                "rate_plan":
                    rate_plan,

                "nights":
                    nights,

                "total_price_usd":
                    room_data.total_price_usd,

                "nightly_rate_usd":
                    nightly_rate_usd,

                "total_price_egp":
                    room_total_egp,

                "nightly_rate_egp":
                    room_nightly_egp,

            })

        # =================================================
        # Create Reservation
        # =================================================

        reservation = Reservation(

            booking_number=
                booking_number,

            hotel_id=
                data.hotel_id,

            guest_name=
                data.guest_name,

            total_guest=
                adult_count,

            adult_count=
                adult_count,

            child_count=
                child_count,

            nationality=
                normalize_nationality(
                    data.nationality
                ),

            check_in=
                data.check_in,

            check_out=
                data.check_out,

            reservation_type=
                data.payment_type,

            total_price=
                total_price_usd,

            commission=
                0,

            guest_requests=
                data.guest_requests,

            status=
                "confirmed",

            created_by=
                data.created_by,

            hotel_confirmation_number=
                None,

            email_status=
                "not_required",

            email_sent_at=
                None,

            email_error=
                None,

            payment_receipt_path=
                None,

            payment_receipt_last4=
                None,

        )

        session.add(
            reservation
        )

        await session.flush()

        # =================================================
        # Create Reservation Rooms
        # =================================================

        for prepared_room in prepared_rooms:

            reservation_room = ReservationRoom(

                reservation_id=
                    reservation.id,

                room_type_id=
                    prepared_room[
                        "room_type"
                    ].id,

                rate_plan_id=
                    prepared_room[
                        "rate_plan"
                    ].id,

                nights=
                    prepared_room[
                        "nights"
                    ],

                total_price_usd=
                    prepared_room[
                        "total_price_usd"
                    ],

                nightly_rate_usd=
                    prepared_room[
                        "nightly_rate_usd"
                    ],

                total_price_egp=
                    prepared_room[
                        "total_price_egp"
                    ],

                nightly_rate_egp=
                    prepared_room[
                        "nightly_rate_egp"
                    ],

                exchange_rate=
                    data.exchange_rate
                    if is_cash
                    else None,

            )

            session.add(
                reservation_room
            )

        # =================================================
        # Commit
        # =================================================

        await session.commit()

        # =================================================
        # Reload
        # =================================================

        result = await session.execute(

            select(Reservation)

            .options(

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.room_type
                ),

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.rate_plan
                ),

                selectinload(
                    Reservation.hotel
                ),

            )

            .where(
                Reservation.id
                == reservation.id
            )

        )

        reservation = (
            result.scalar_one()
        )

        # =================================================
        # Response
        # =================================================

        return {

            "success":
                True,

            "message":
                "Reservation created successfully",

            "reservation":
                serialize_reservation(
                    reservation
                ),

        }


# =========================================================
# Google OAuth / Gmail Settings
# =========================================================

@app.get("/auth/google/start")
async def google_auth_start(request: Request):
    try:
        client_secret_file = find_google_client_secret_file()
        flow = Flow.from_client_secrets_file(
            str(client_secret_file),
            scopes=GOOGLE_SCOPES,
            redirect_uri=GOOGLE_REDIRECT_URI,
        )

        authorization_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )

        # Store both OAuth state and PKCE code verifier. Google requires the
        # same verifier when exchanging the authorization code for tokens.
        request.session["google_oauth_state"] = state
        request.session["google_oauth_code_verifier"] = flow.code_verifier
        OAUTH_STATES[state] = flow.code_verifier

        print("[Google OAuth] START: state and code verifier saved")

        return RedirectResponse(authorization_url, status_code=302)

    except FileNotFoundError as error:
        raise HTTPException(status_code=500, detail=str(error))
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not start Google sign-in: {error}",
        )


@app.get("/auth/google/callback")
async def google_auth_callback(request: Request):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(
            f"{FRONTEND_URL}/settings?google=error&message={error}",
            status_code=302,
        )

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    saved_state = request.session.pop("google_oauth_state", None)
    saved_code_verifier = request.session.pop(
        "google_oauth_code_verifier",
        None,
    )
    if not saved_state:
        saved_state = state if state in OAUTH_STATES else None
    if not saved_code_verifier and state:
        saved_code_verifier = OAUTH_STATES.get(state)
    if state:
        OAUTH_STATES.pop(state, None)

    print(
        "[Google OAuth] CALLBACK: "
        f"state_ok={bool(state and saved_state and state == saved_state)}, "
        f"verifier_present={bool(saved_code_verifier)}"
    )

    if not code:
        return RedirectResponse(
            f"{FRONTEND_URL}/settings?google=error&message=no_code",
            status_code=302,
        )

    if not state or not saved_state or state != saved_state:
        print("[Google OAuth] Invalid state")
        return RedirectResponse(
            f"{FRONTEND_URL}/settings?google=error&message=invalid_state",
            status_code=302,
        )

    if not saved_code_verifier:
        print("[Google OAuth] Missing PKCE code verifier")
        return RedirectResponse(
            f"{FRONTEND_URL}/settings?google=error&message=missing_code_verifier",
            status_code=302,
        )

    try:
        client_secret_file = find_google_client_secret_file()
        flow = Flow.from_client_secrets_file(
            str(client_secret_file),
            scopes=GOOGLE_SCOPES,
            state=state,
            redirect_uri=GOOGLE_REDIRECT_URI,
        )

        print("[Google OAuth] FETCH TOKEN START")
        flow.fetch_token(
            code=code,
            code_verifier=saved_code_verifier,
        )
        print("[Google OAuth] FETCH TOKEN SUCCESS")

        save_google_credentials(flow.credentials)
        print(
            "[Google OAuth] TOKEN SAVED =",
            GOOGLE_TOKEN_FILE.exists(),
            "SIZE =",
            GOOGLE_TOKEN_FILE.stat().st_size
            if GOOGLE_TOKEN_FILE.exists()
            else 0,
        )

        email = get_connected_google_email()
        if not email:
            raise RuntimeError(
                "Google is connected, but the Gmail address could not be read."
            )

        return RedirectResponse(
            f"{FRONTEND_URL}/settings?google=connected",
            status_code=302,
        )

    except Exception as error:
        print(f"[Google OAuth] Callback failed: {error}")
        return RedirectResponse(
            f"{FRONTEND_URL}/settings?google=error",
            status_code=302,
        )


@app.get("/auth/google/status")
async def google_auth_status():
    email = get_connected_google_email()
    return {
        "connected": bool(email),
        "email": email or "",
        "provider": "gmail",
    }


@app.post("/auth/google/disconnect")
async def google_auth_disconnect():
    try:
        if GOOGLE_TOKEN_FILE.exists():
            GOOGLE_TOKEN_FILE.unlink()

        return {
            "success": True,
            "message": "Gmail account disconnected successfully",
        }
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not disconnect Gmail: {error}",
        )


@app.get("/email-settings")
async def get_email_settings_endpoint():
    return serialize_email_settings()


@app.post("/email-settings/test")
async def test_email_settings(data: EmailTestRequest):
    recipient = data.recipient_email.strip()
    if not recipient:
        raise HTTPException(
            status_code=400,
            detail="Recipient email is required",
        )

    try:
        gmail_send_message(
            recipient=recipient,
            subject="Hotel Reservation System - Test Email",
            body=(
                "This is a test email from Hotel Reservation System.\n\n"
                "If you received this message, the connected Gmail account is working correctly."
            ),
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Email test failed: {error}",
        )

    return {
        "success": True,
        "message": "Test email sent successfully",
        "recipient_email": recipient,
    }


# =========================================================
# Send Reservation Email
# =========================================================

@app.post(
    "/reservation/{booking_number}/send-email"
)
async def send_reservation_email(
    booking_number: str,
    data: ReservationEmailRequest
):

    async with AsyncSessionLocal() as session:

        # =================================================
        # Load Reservation
        # =================================================

        result = await session.execute(

            select(Reservation)

            .options(

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.room_type
                ),

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.rate_plan
                ),

                selectinload(
                    Reservation.hotel
                ),

            )

            .where(
                Reservation.booking_number
                == booking_number
            )

        )

        reservation = (
            result.scalar_one_or_none()
        )

        if not reservation:

            raise HTTPException(
                status_code=404,
                detail="Reservation not found",
            )

        # =================================================
        # Hotel Email
        # =================================================

        hotel = reservation.hotel

        if not hotel:

            raise HTTPException(
                status_code=400,
                detail="No hotel is linked to this reservation",
            )

        hotel_email = (
            data.recipient_email
            or hotel.email
            or ""
        ).strip()

        if not hotel_email:

            reservation.email_status = "failed"

            reservation.email_error = (
                "The hotel has no registered email address"
            )

            await session.commit()

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Hotel {hotel.name} "
                    "has no registered email address"
                ),
            )

        # =================================================
        # Gmail Configuration
        # =================================================

        if not google_connected():
            reservation.email_status = "failed"
            reservation.email_error = (
                "Gmail is not connected. Connect Gmail from Settings."
            )
            await session.commit()
            raise HTTPException(
                status_code=500,
                detail=(
                    "Gmail is not connected. "
                    "Go to Settings → Connect Gmail first."
                ),
            )

        # =================================================
        # Build Email
        # =================================================

        payment_label = get_payment_label(
            reservation.reservation_type
        )

        nights = calculate_nights(
            reservation.check_in,
            reservation.check_out
        )

        total_usd = sum(
            float(room.total_price_usd)
            for room in reservation.rooms
        )

        total_egp = None
        if is_cash_payment(reservation.reservation_type):
            total_egp = sum(
                float(room.total_price_egp or 0)
                for room in reservation.rooms
            )

        subject = (
            f"New Reservation - "
            f"{reservation.booking_number} - "
            f"{hotel.name}"
        )

        guest_text = format_guest_composition(
            reservation.adult_count,
            reservation.child_count,
            reservation.total_guest,
        )

        # Plain-text fallback.
        body_lines = [
            f"Dear {hotel.name} Team,",
            "",
            "Please find below the new reservation details.",
            "",
            "RESERVATION DETAILS",
            f"Booking Number: {reservation.booking_number}",
            f"Guest Name: {reservation.guest_name or '-'}",
            f"Guests: {guest_text}",
            f"Nationality: {reservation.nationality or '-'}",
            f"Check-in: {format_date_for_email(reservation.check_in)}",
            f"Check-out: {format_date_for_email(reservation.check_out)}",
            f"Nights: {nights or '-'}",
            f"Payment Type: {payment_label}",
            "",
            "ROOM DETAILS",
        ]

        for index, room in enumerate(
            reservation.rooms,
            start=1
        ):
            body_lines.extend([
                f"Room {index}: {room.room_type.name if room.room_type else '-'}",
                f"Rate Plan: {room.rate_plan.code if room.rate_plan else '-'}",
                f"Meals: {room.rate_plan.meals if room.rate_plan else '-'}",
                f"Price/Night: {float(room.nightly_rate_usd):,.2f} USD",
            ])
            if room.nightly_rate_egp is not None:
                body_lines.append(
                    f"Price/Night: {float(room.nightly_rate_egp):,.2f} EGP"
                )
            body_lines.append(
                f"Total Price: {float(room.total_price_usd):,.2f} USD"
            )
            if room.total_price_egp is not None:
                body_lines.append(
                    f"Total Price: {float(room.total_price_egp):,.2f} EGP"
                )
            body_lines.append("")

        if reservation.guest_requests:
            body_lines.extend([
                "GUEST REQUESTS",
                reservation.guest_requests,
                "",
            ])

        body_lines.extend([
            f"Total Reservation: {total_usd:,.2f} USD",
        ])

        if total_egp is not None:
            body_lines.append(
                f"Total Reservation: {total_egp:,.2f} EGP"
            )

        body_lines.extend([
            "",
            "Please confirm the reservation and provide the hotel confirmation number.",
            "",
            "Best regards,",
            reservation.created_by or "Reservations Department",
        ])

        email_body = "\n".join(body_lines)

        # =================================================
        # Dynamic HTML Reservation Table
        # =================================================

        is_cash_email = is_cash_payment(
            reservation.reservation_type
        )

        currency_headers = (
            "<th>Price / Night<br><span class='muted'>USD / EGP</span></th>"
            "<th>Total Price<br><span class='muted'>USD / EGP</span></th>"
            if is_cash_email
            else
            "<th>Price / Night<br><span class='muted'>USD</span></th>"
            "<th>Total Price<br><span class='muted'>USD</span></th>"
        )

        room_rows: list[str] = []

        for index, room in enumerate(
            reservation.rooms,
            start=1
        ):
            nightly_usd = float(room.nightly_rate_usd or 0)
            total_room_usd = float(room.total_price_usd or 0)

            nightly_cell = f"USD {nightly_usd:,.2f}"
            total_cell = f"USD {total_room_usd:,.2f}"

            if is_cash_email:
                if room.nightly_rate_egp is not None:
                    nightly_cell += (
                        f"<br><span class='egp'>EGP "
                        f"{float(room.nightly_rate_egp):,.2f}</span>"
                    )

                if room.total_price_egp is not None:
                    total_cell += (
                        f"<br><span class='egp'>EGP "
                        f"{float(room.total_price_egp):,.2f}</span>"
                    )

            room_rows.append(
                "<tr>"
                f"<td><strong>Room {index}</strong></td>"
                f"<td>{escape(room.room_type.name if room.room_type else '-') }</td>"
                f"<td>{escape(room.rate_plan.code if room.rate_plan else '-')}"
                f"<br><span class='muted'>{escape(room.rate_plan.name if room.rate_plan else '-')}</span></td>"
                f"<td>{escape(room.rate_plan.meals if room.rate_plan else '-')}</td>"
                f"<td>{nightly_cell}</td>"
                f"<td>{total_cell}</td>"
                "</tr>"
            )

        guest_request_html = (
            f"<tr><th>Guest Requests</th><td colspan='5'>{escape(reservation.guest_requests)}</td></tr>"
            if reservation.guest_requests
            else ""
        )

        total_egp_html = (
            f"<div class='total-sub'>EGP {total_egp:,.2f}</div>"
            if total_egp is not None
            else ""
        )

        html_body = f"""
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
body {{ margin:0; padding:24px 12px; background:#f4f6f8; color:#172033; font-family:Arial,Helvetica,sans-serif; }}
.container {{ max-width:900px; margin:0 auto; background:#ffffff; border:1px solid #d7dee8; border-radius:16px; overflow:hidden; box-shadow:0 6px 24px rgba(15,23,42,.08); }}
.top {{ padding:22px 28px; background:#0f172a; color:#ffffff; }}
.top h1 {{ margin:0 0 10px; font-size:22px; line-height:1.3; }}
.top p {{ margin:0; color:#cbd5e1; font-size:12px; line-height:1.5; }}
.badge {{ display:inline-block; padding:4px 9px; border:1px solid #475569; border-radius:999px; color:#e2e8f0; background:#1e293b; font-weight:700; }}
.content {{ padding:24px 28px 28px; }}
table {{ width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }}
th, td {{ border-right:1px solid #dfe5ec; border-bottom:1px solid #dfe5ec; padding:10px 9px; text-align:left; vertical-align:top; }}
th:first-child, td:first-child {{ border-left:1px solid #dfe5ec; }}
thead th:first-child {{ border-top-left-radius:8px; }}
thead th:last-child {{ border-top-right-radius:8px; }}
tbody tr:last-child td:first-child {{ border-bottom-left-radius:8px; }}
tbody tr:last-child td:last-child {{ border-bottom-right-radius:8px; }}
th {{ background:#eef3f8; font-weight:700; color:#334155; width:170px; }}
.section {{ margin:0 0 10px; font-size:16px; color:#0f172a; line-height:1.35; }}
.room-table thead th {{ background:#e8eef5; color:#25324a; font-size:12px; white-space:nowrap; }}
.room-table tbody td {{ background:#ffffff; }}
.room-table tbody tr:nth-child(even) td {{ background:#fafbfd; }}
.room-table .price {{ font-weight:700; color:#0f172a; white-space:nowrap; }}
.muted {{ color:#6b7280; font-size:11px; line-height:1.4; }}
.egp {{ color:#8a5a00; font-weight:700; }}
.total {{ margin-top:18px; border:1px solid #cbd5e1; border-radius:12px; background:#f8fafc; overflow:hidden; }}
.total-title {{ padding:11px 14px; background:#eef3f8; color:#334155; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.2px; }}
.total-table td {{ border:0; border-top:1px solid #dfe5ec; padding:12px 14px; font-size:15px; font-weight:700; background:#ffffff; }}
.total-table td:last-child {{ text-align:right; color:#0f172a; white-space:nowrap; }}
.total-table .egp-total {{ color:#8a5a00; }}
.footer {{ margin-top:22px; padding-top:18px; border-top:1px solid #e2e8f0; font-size:13px; line-height:1.7; color:#334155; }}
@media only screen and (max-width:640px) {{
  body {{ padding:8px 4px; }}
  .container {{ border-radius:10px; }}
  .top {{ padding:18px 16px; }}
  .top h1 {{ font-size:19px; }}
  .content {{ padding:16px 12px 20px; }}
  table {{ font-size:12px; }}
  th, td {{ padding:8px 7px; }}
  .room-table {{ min-width:690px; }}
  .room-wrap {{ overflow-x:auto; }}
}}
</style>
</head>
<body>
<div class="container">
  <div class="top">
    <h1>{escape(hotel.name)} — Reservation</h1>
    <p><span class="badge">{escape(payment_label)}</span> &nbsp; | &nbsp; Booking #{escape(reservation.booking_number)}</p>
  </div>
  <div class="content">
    <h2 class="section">Reservation Details</h2>
    <table>
      <tr><th>Booking Number</th><td>{escape(reservation.booking_number)}</td></tr>
      <tr><th>Guest Name</th><td>{escape(reservation.guest_name or '-')}</td></tr>
      <tr><th>Guests</th><td>{escape(guest_text)}</td></tr>
      <tr><th>Nationality</th><td>{escape(reservation.nationality or '-')}</td></tr>
      <tr><th>Check-in</th><td>{escape(format_date_for_email(reservation.check_in))}</td></tr>
      <tr><th>Check-out</th><td>{escape(format_date_for_email(reservation.check_out))}</td></tr>
      <tr><th>Total Nights</th><td>{nights or '-'}</td></tr>
      <tr><th>Payment Type</th><td>{escape(payment_label)}</td></tr>
      {guest_request_html}
    </table>

    <h2 class="section" style="margin-top:24px;">Room Details</h2>
    <div class="room-wrap">
      <table class="room-table">
        <thead><tr><th>Room</th><th>Room Type</th><th>Rate Plan</th><th>Meals</th>{currency_headers}</tr></thead>
        <tbody>{''.join(room_rows)}</tbody>
      </table>
    </div>

    <div class="total">
      <div class="total-title">Total Reservation</div>
      <table class="total-table">
        <tr><td>Total Price</td><td>USD {total_usd:,.2f}</td></tr>
        {f"<tr><td>Total Price</td><td class='egp-total'>EGP {total_egp:,.2f}</td></tr>" if total_egp is not None else ""}
      </table>
    </div>

    <div class="footer">
      Please confirm the reservation and provide the hotel confirmation number.<br><br>
      Best regards,<br>
      {escape(reservation.created_by or 'Reservations Department')}
    </div>
  </div>
</div>
</body>
</html>
"""

        # =================================================
        # Send through Gmail API
        # =================================================

        try:
            gmail_send_message(
                recipient=hotel_email,
                subject=subject,
                body=email_body,
                html_body=html_body,
            )

        except Exception as error:

            reservation.email_status = "failed"

            reservation.email_error = str(
                error
            )

            await session.commit()

            raise HTTPException(
                status_code=500,
                detail=(
                    "Failed to send email: "
                    f"{error}"
                ),
            )

        # =================================================
        # Update Email Status
        # =================================================

        reservation.email_status = "sent"

        reservation.email_sent_at = (
            datetime.now(timezone.utc)
        )

        reservation.email_error = None

        await session.commit()

        # =================================================
        # Response
        # =================================================

        return {

            "success":
                True,

            "message":
                "Reservation sent to hotel successfully",

            "booking_number":
                reservation.booking_number,

            "hotel":
                hotel.name,

            "email":
                hotel_email,

            "sent_by":
                data.sent_by,

            "email_status":
                reservation.email_status,

            "email_sent_at":
                reservation.email_sent_at,

        }


# =========================================================
# Update Hotel Confirmation Number
# =========================================================

class HotelConfirmationRequest(BaseModel):

    confirmation_number: str | None = None


@app.patch(
    "/reservation/{booking_number}/hotel-confirmation"
)
async def update_hotel_confirmation(
    booking_number: str,
    data: HotelConfirmationRequest
):

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(Reservation).where(
                Reservation.booking_number
                == booking_number
            )

        )

        reservation = (
            result.scalar_one_or_none()
        )

        if not reservation:

            raise HTTPException(
                status_code=404,
                detail="Reservation not found",
            )

        confirmation_number = (
            data.confirmation_number.strip()
            if data.confirmation_number
            else None
        )

        reservation.hotel_confirmation_number = (
            confirmation_number
        )

        await session.commit()

        return {

            "success":
                True,

            "message":
                "Hotel confirmation number updated",

            "booking_number":
                reservation.booking_number,

            "hotel_confirmation_number":
                reservation.hotel_confirmation_number,

        }



# =========================================================
# Update Reservation Status
# =========================================================

class ReservationStatusRequest(BaseModel):

    status: str


@app.patch(
    "/reservation/{booking_number}/status"
)
async def update_reservation_status(
    booking_number: str,
    data: ReservationStatusRequest
):

    allowed_statuses = {
        "confirmed",
        "cancelled",
        "no_show",
        "completed",
        "pending",
    }

    status = (
        data.status.strip().lower()
    )

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid reservation status. "
                "Allowed statuses: "
                "confirmed, cancelled, no_show, completed, pending"
            ),
        )

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(Reservation).where(
                Reservation.booking_number
                == booking_number
            )

        )

        reservation = (
            result.scalar_one_or_none()
        )

        if not reservation:

            raise HTTPException(
                status_code=404,
                detail="Reservation not found",
            )

        reservation.status = status

        await session.commit()

        # Reload reservation with all related data.
        result = await session.execute(

            select(Reservation)

            .options(

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.room_type
                ),

                selectinload(
                    Reservation.rooms
                ).selectinload(
                    ReservationRoom.rate_plan
                ),

                selectinload(
                    Reservation.hotel
                ),

            )

            .where(
                Reservation.id
                == reservation.id
            )

        )

        reservation = (
            result.scalar_one()
        )

        return {

            "success":
                True,

            "message":
                "Reservation status updated successfully",

            "booking_number":
                reservation.booking_number,

            "status":
                reservation.status,

            "reservation":
                serialize_reservation(
                    reservation
                ),

        }


# =========================================================
# Printed Reservations
# =========================================================

@app.post(
    "/reservation/{booking_number}/print"
)
async def record_printed_reservation(
    booking_number: str,
    data: PrintedReservationCreate,
):
    async with AsyncSessionLocal() as session:

        result = await session.execute(
            select(Reservation).where(
                Reservation.booking_number
                == booking_number
            )
        )

        reservation = result.scalar_one_or_none()

        if not reservation:
            raise HTTPException(
                status_code=404,
                detail="Reservation not found",
            )

        printed_by = (
            data.printed_by.strip()
            if data.printed_by
            else None
        )

        copies = data.copies

        if copies < 1:
            raise HTTPException(
                status_code=400,
                detail="Copies must be at least 1",
            )

        if copies > 100:
            raise HTTPException(
                status_code=400,
                detail="Copies cannot exceed 100",
            )

        record = PrintedReservation(
            reservation_id=reservation.id,
            booking_number=reservation.booking_number,
            printed_by=printed_by,
            copies=copies,
            printed_at=datetime.now(timezone.utc),
        )

        session.add(record)
        await session.commit()
        await session.refresh(record)

        return {
            "success": True,
            "message": "Reservation print recorded",
            "print_record": {
                "id": record.id,
                "reservation_id": record.reservation_id,
                "booking_number": record.booking_number,
                "printed_by": record.printed_by,
                "copies": record.copies,
                "printed_at": record.printed_at,
            },
        }


@app.get(
    "/printed-reservations"
)
async def get_printed_reservations():
    async with AsyncSessionLocal() as session:

        result = await session.execute(
            select(PrintedReservation)
            .order_by(
                PrintedReservation.id.desc()
            )
        )

        records = result.scalars().all()

        return [
            {
                "id": record.id,
                "reservation_id": record.reservation_id,
                "booking_number": record.booking_number,
                "printed_by": record.printed_by,
                "copies": record.copies,
                "printed_at": record.printed_at,
            }
            for record in records
        ]


@app.get(
    "/reservation/{booking_number}/print-history"
)
async def get_reservation_print_history(
    booking_number: str,
):
    async with AsyncSessionLocal() as session:

        reservation_result = await session.execute(
            select(Reservation).where(
                Reservation.booking_number
                == booking_number
            )
        )

        reservation = (
            reservation_result.scalar_one_or_none()
        )

        if not reservation:
            raise HTTPException(
                status_code=404,
                detail="Reservation not found",
            )

        result = await session.execute(
            select(PrintedReservation)
            .where(
                PrintedReservation.reservation_id
                == reservation.id
            )
            .order_by(
                PrintedReservation.id.desc()
            )
        )

        records = result.scalars().all()

        return {
            "booking_number":
                reservation.booking_number,
            "print_count":
                len(records),
            "records": [
                {
                    "id": record.id,
                    "printed_by":
                        record.printed_by,
                    "copies":
                        record.copies,
                    "printed_at":
                        record.printed_at,
                }
                for record in records
            ],
        }


# =========================================================
# Users
# =========================================================

def serialize_user(user: User):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": normalize_role(user.role),
        "is_active": user.is_active,
        "created_at": user.created_at,
    }


@app.get("/users")
async def get_users():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).order_by(User.id.desc())
        )

        users = result.scalars().all()

        return [
            serialize_user(user)
            for user in users
        ]


@app.post("/users")
async def create_user(
    request: Request,
    data: UserCreateRequest,
):
    username = data.username.strip()
    password = data.password

    if not username:
        raise HTTPException(
            status_code=400,
            detail="Username is required",
        )

    if not password:
        raise HTTPException(
            status_code=400,
            detail="Password is required",
        )

    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters",
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                User.username == username
            )
        )

        existing_user = (
            result.scalar_one_or_none()
        )

        if existing_user:
            raise HTTPException(
                status_code=409,
                detail="Username already exists",
            )

        password_hash = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")

        role = normalize_role(data.role)

        if data.role is not None and data.role.strip() and role not in ALLOWED_ROLES:
            raise HTTPException(
                status_code=400,
                detail="Invalid role",
            )

        current_role = normalize_role(
            request.session.get("role")
        )

        # Manager can manage users, but cannot grant the IT role.
        if role == ROLE_IT and current_role != ROLE_IT:
            raise HTTPException(
                status_code=403,
                detail="Only IT can create or assign the IT role",
            )

        user = User(
            username=username,
            password_hash=password_hash,
            full_name=(
                data.full_name.strip()
                if data.full_name
                else None
            ),
            role=role,
            is_active=data.is_active,
        )

        session.add(user)

        await session.commit()
        await session.refresh(user)

        return {
            "success": True,
            "message": "User added successfully",
            "user": serialize_user(user),
        }


@app.patch("/users/{user_id}")
async def update_user(
    request: Request,
    user_id: int,
    data: UserUpdateRequest,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                User.id == user_id
            )
        )

        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found",
            )

        if data.username is not None:
            username = data.username.strip()

            if not username:
                raise HTTPException(
                    status_code=400,
                    detail="Username cannot be empty",
                )

            if username != user.username:
                duplicate_result = await session.execute(
                    select(User).where(
                        User.username == username
                    )
                )

                duplicate_user = (
                    duplicate_result.scalar_one_or_none()
                )

                if duplicate_user:
                    raise HTTPException(
                        status_code=409,
                        detail="Username already exists",
                    )

                user.username = username

        if data.full_name is not None:
            user.full_name = (
                data.full_name.strip()
                or None
            )

        if data.role is not None:
            normalized_role = normalize_role(data.role)

            if normalized_role not in ALLOWED_ROLES:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid role",
                )

            current_role = normalize_role(
                request.session.get("role")
            )
            existing_role = normalize_role(user.role)

            # Only IT can assign, remove, or change an IT account.
            if (
                normalized_role == ROLE_IT
                or existing_role == ROLE_IT
            ) and current_role != ROLE_IT:
                raise HTTPException(
                    status_code=403,
                    detail="Only IT can assign or change the IT role",
                )

            user.role = normalized_role

        if data.is_active is not None:
            user.is_active = data.is_active

        if data.password is not None:
            password = data.password

            if not password:
                raise HTTPException(
                    status_code=400,
                    detail="New password cannot be empty",
                )

            if len(password) < 6:
                raise HTTPException(
                    status_code=400,
                    detail="Password must be at least 6 characters",
                )

            user.password_hash = bcrypt.hashpw(
                password.encode("utf-8"),
                bcrypt.gensalt(),
            ).decode("utf-8")

        await session.commit()
        await session.refresh(user)

        return {
            "success": True,
            "message": "User updated successfully",
            "user": serialize_user(user),
        }


@app.patch("/users/{user_id}/status")
async def update_user_status(
    request: Request,
    user_id: int,
    data: UserUpdateRequest,
):
    if data.is_active is None:
        raise HTTPException(
            status_code=400,
            detail="is_active is required",
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                User.id == user_id
            )
        )

        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found",
            )

        user.is_active = data.is_active

        await session.commit()
        await session.refresh(user)

        return {
            "success": True,
            "message": (
                "User enabled successfully"
                if user.is_active
                else "User disabled successfully"
            ),
            "user": serialize_user(user),
        }


@app.delete("/users/{user_id}")
async def delete_user(
    request: Request,
    user_id: int,
):
    current_user_id = int(request.session.get("user_id"))

    if user_id == current_user_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account",
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                User.id == user_id
            )
        )

        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found",
            )

        current_role = normalize_role(
            request.session.get("role")
        )

        if (
            normalize_role(user.role) == ROLE_IT
            and current_role != ROLE_IT
        ):
            raise HTTPException(
                status_code=403,
                detail="Only IT can delete an IT user",
            )

        await session.delete(user)
        await session.commit()

        return {
            "success": True,
            "message": "User deleted successfully",
        }


# =========================================================
# System License
# =========================================================

class LicenseActivateRequest(BaseModel):
    code: str


@app.get("/license/status")
async def license_status():
    return await get_license_status()


@app.post("/license/generate")
async def license_generate(request: Request):
    current_role = normalize_role(
        request.session.get("role")
    )

    if current_role != ROLE_IT:
        raise HTTPException(
            status_code=403,
            detail="Only IT can generate activation codes",
        )

    user_id = request.session.get("user_id")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    code = await generate_license_key(int(user_id))

    return {
        "success": True,
        "message": (
            "Activation code generated. "
            "It is shown only once."
        ),
        "code": code,
        "valid_for_days": LICENSE_DURATION_DAYS,
    }


@app.post("/license/activate")
async def license_activate(
    request: Request,
    data: LicenseActivateRequest,
):
    current_role = normalize_role(
        request.session.get("role")
    )

    if current_role != ROLE_IT:
        raise HTTPException(
            status_code=403,
            detail="Only IT can activate the system",
        )

    return await activate_license(
        request,
        data.code,
    )


# =========================================================
# Login
# =========================================================

@app.post("/login")
async def login(
    request: Request,
    data: LoginRequest,
):

    username = (
        data.username.strip()
    )

    password = data.password

    if not username or not password:

        raise HTTPException(
            status_code=400,
            detail="Username and password are required",
        )

    # TEMPORARY PRODUCTION BOOTSTRAP
    # The dedicated bootstrap route can be intercepted by an outer
    # authentication layer in some deployments.  The normal /login route
    # is explicitly public, so this one-time branch performs the same
    # protected database reset when the correct reset secret is supplied.
    reset_secret = os.getenv("RESET_ADMIN_SECRET")
    provided_reset_secret = request.headers.get("X-Reset-Secret", "")

    if (
        reset_secret
        and provided_reset_secret
        and hmac.compare_digest(
            provided_reset_secret,
            reset_secret,
        )
        and username == "Mostafa Aamer"
    ):
        if len(password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters",
            )

        target_username = "Mostafa Aamer"
        target_full_name = "Mostafa Aamer"
        password_hash = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(
                    User.username == target_username
                )
            )

            user = result.scalar_one_or_none()

            if user is None:
                user = User(
                    username=target_username,
                    password_hash=password_hash,
                    full_name=target_full_name,
                    role=ROLE_IT,
                    is_active=True,
                )
                session.add(user)
                await session.flush()
                action = "created"
            else:
                user.password_hash = password_hash
                user.full_name = user.full_name or target_full_name
                user.role = ROLE_IT
                user.is_active = True
                action = "reset"

            await session.commit()
            await session.refresh(user)

        return {
            "success": True,
            "message": f"IT account {action} successfully",
            "username": target_username,
            "role": ROLE_IT,
            "user_id": user.id,
        }

    async with AsyncSessionLocal() as session:

        result = await session.execute(

            select(User).where(
                User.username == username
            )

        )

        user = (
            result.scalar_one_or_none()
        )

        if not user:

            raise HTTPException(
                status_code=401,
                detail=(
                    "Invalid username or password"
                ),
            )

        if not user.is_active:

            raise HTTPException(
                status_code=403,
                detail="This user is inactive",
            )

        password_correct = bcrypt.checkpw(

            password.encode("utf-8"),

            user.password_hash.encode("utf-8"),

        )

        if not password_correct:

            raise HTTPException(
                status_code=401,
                detail=(
                    "Invalid username or password"
                ),
            )

        normalized_role = normalize_role(user.role)

        request.session["user_id"] = user.id
        request.session["username"] = user.username
        request.session["role"] = normalized_role

        return {

            "success":
                True,

            "message":
                "Login successful",

            "user": {

                "id":
                    user.id,

                "username":
                    user.username,

                "full_name":
                    user.full_name,

                "role":
                    normalized_role,

                "is_active":
                    user.is_active,

            },

        }


# =========================================================
# =========================================================
# TEMPORARY IT PASSWORD RESET
# =========================================================
# IMPORTANT:
# This endpoint is intentionally temporary.
# Remove this endpoint, its request model, the public-path entry,
# and RESET_ADMIN_SECRET after the production password is reset.

@app.post("/bootstrap/reset-it-password")
async def reset_it_password(
    request: Request,
    data: TemporaryITPasswordResetRequest,
):
    """
    Temporary production bootstrap for the primary IT account.

    If the account already exists, its password is reset and the account is
    promoted to the IT role. If it does not exist in the production database,
    the account is created automatically. This is protected by the separate
    RESET_ADMIN_SECRET environment variable.
    """

    configured_secret = os.getenv("RESET_ADMIN_SECRET")

    if not configured_secret:
        raise HTTPException(
            status_code=503,
            detail="Temporary reset endpoint is not configured",
        )

    provided_secret = request.headers.get("X-Reset-Secret", "")

    if not provided_secret or not hmac.compare_digest(
        provided_secret,
        configured_secret,
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid reset secret",
        )

    new_password = data.new_password

    if len(new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters",
        )

    target_username = "Mostafa Aamer"
    target_full_name = "Mostafa Aamer"
    password_hash = bcrypt.hashpw(
        new_password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                User.username == target_username
            )
        )

        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                username=target_username,
                password_hash=password_hash,
                full_name=target_full_name,
                role=ROLE_IT,
                is_active=True,
            )
            session.add(user)
            await session.flush()
            action = "created"
        else:
            user.password_hash = password_hash
            user.full_name = user.full_name or target_full_name
            user.role = ROLE_IT
            user.is_active = True
            action = "reset"

        await session.commit()
        await session.refresh(user)

    return {
        "success": True,
        "message": f"IT account {action} successfully",
        "username": target_username,
        "role": ROLE_IT,
        "user_id": user.id,
    }


# Current Session
# =========================================================

@app.get("/auth/me")
async def auth_me(request: Request):
    user_id = request.session.get("user_id")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                User.id == int(user_id)
            )
        )

        user = result.scalar_one_or_none()

        if not user:
            request.session.clear()
            raise HTTPException(
                status_code=401,
                detail="Authentication required",
            )

        if not user.is_active:
            request.session.clear()
            raise HTTPException(
                status_code=403,
                detail="This user is inactive",
            )

        normalized_role = normalize_role(user.role)

        request.session["role"] = normalized_role
        request.session["username"] = user.username

        return {
            "authenticated": True,
            "user": serialize_user(user),
        }


@app.post("/logout")
async def logout(request: Request):
    request.session.clear()

    return {
        "success": True,
        "message": "Logged out successfully",
    }

# =========================================================
# Final ASGI Session Wrapper
# =========================================================
# IMPORTANT:
# Starlette's decorator-based HTTP middleware is outer to middleware added
# with app.add_middleware(). Wrapping the completed application here guarantees
# that SessionMiddleware runs before authorization_middleware, so
# request.session is available inside the authorization layer.
app = SessionMiddleware(
    app,
    secret_key=SESSION_SECRET,
    same_site="none",
    https_only=True,
)
