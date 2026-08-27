from sqlalchemy import (
    String,
    Integer,
    BigInteger,
    Numeric,
    Date,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import date, datetime, timezone

from database import Base


# =========================================================
# Reservation
# =========================================================

class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    booking_number: Mapped[str] = mapped_column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    hotel_id: Mapped[int | None] = mapped_column(
        ForeignKey("hotels.id"),
        nullable=True
    )

    guest_name: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    total_guest: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )

    # Guest composition. Keep total_guest for backward compatibility,
    # but the application should use these two fields for display.
    adult_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )

    child_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )

    nationality: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    check_in: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )

    check_out: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )

    # =====================================================
    # Payment / Reservation Type
    # =====================================================

    reservation_type: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    # =====================================================
    # Old Financial Fields
    # =====================================================

    total_price: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=0
    )

    commission: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=0
    )

    # =====================================================
    # Guest Requests
    # =====================================================

    guest_requests: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # =====================================================
    # Reservation Status
    # =====================================================

    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="confirmed"
    )

    # =====================================================
    # Created By
    # =====================================================

    created_by: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    # =====================================================
    # Hotel Confirmation
    # =====================================================

    hotel_confirmation_number: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    # =====================================================
    # Email Status
    #
    # pending       = email not sent
    # sent          = sent
    # failed        = send failed
    # not_required  = not required
    # =====================================================

    email_status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="not_required"
    )

    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    email_error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # =====================================================
    # Payment Receipt
    #
    # payment_receipt_path:
    #   Path to the payment receipt image stored on the server.
    #
    # payment_receipt_last4:
    #   Last 4 digits of the payment transaction.
    # =====================================================

    payment_receipt_path: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    payment_receipt_last4: Mapped[str | None] = mapped_column(
        String(4),
        nullable=True
    )

    # =====================================================
    # Timestamps
    # =====================================================

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # =====================================================
    # Relationships
    # =====================================================

    rooms: Mapped[list["ReservationRoom"]] = relationship(
        "ReservationRoom",
        back_populates="reservation",
        cascade="all, delete-orphan"
    )

    hotel: Mapped["Hotel | None"] = relationship(
        "Hotel",
        back_populates="reservations"
    )

    printed_records: Mapped[list["PrintedReservation"]] = relationship(
        "PrintedReservation",
        back_populates="reservation",
        cascade="all, delete-orphan"
    )


# =========================================================
# Reservation Room
# =========================================================

class ReservationRoom(Base):
    __tablename__ = "reservation_rooms"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    reservation_id: Mapped[int] = mapped_column(
        ForeignKey(
            "reservations.id",
            ondelete="CASCADE"
        ),
        nullable=False,
        index=True
    )

    room_type_id: Mapped[int] = mapped_column(
        ForeignKey("room_types.id"),
        nullable=False
    )

    rate_plan_id: Mapped[int] = mapped_column(
        ForeignKey("rate_plans.id"),
        nullable=False
    )

    # =====================================================
    # Stay
    # =====================================================

    nights: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    # =====================================================
    # USD
    # =====================================================

    total_price_usd: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    nightly_rate_usd: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    # =====================================================
    # EGP - Cash Only
    # =====================================================

    total_price_egp: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True
    )

    nightly_rate_egp: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True
    )

    # =====================================================
    # Exchange Rate At Creation
    # =====================================================

    exchange_rate: Mapped[float | None] = mapped_column(
        Numeric(12, 4),
        nullable=True
    )

    # =====================================================
    # Relationships
    # =====================================================

    reservation: Mapped["Reservation"] = relationship(
        "Reservation",
        back_populates="rooms"
    )

    room_type: Mapped["RoomType"] = relationship(
        "RoomType",
        back_populates="reservation_rooms"
    )

    rate_plan: Mapped["RatePlan"] = relationship(
        "RatePlan",
        back_populates="reservation_rooms"
    )


# =========================================================
# Printed Reservation Record
# =========================================================
#
# Each print operation is stored as an independent record.
# If the same reservation is printed 3 times, it will have 3 records.
# This allows the print date and reprint count to be shown.
#
# =========================================================

class PrintedReservation(Base):
    __tablename__ = "printed_reservations"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    reservation_id: Mapped[int] = mapped_column(
        ForeignKey(
            "reservations.id",
            ondelete="CASCADE"
        ),
        nullable=False,
        index=True
    )

    booking_number: Mapped[str] = mapped_column(
        String,
        nullable=False,
        index=True
    )

    printed_by: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    copies: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1
    )

    printed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    # =====================================================
    # Relationships
    # =====================================================

    reservation: Mapped["Reservation"] = relationship(
        "Reservation",
        back_populates="printed_records"
    )


# =========================================================
# Room Type
# =========================================================

class RoomType(Base):
    __tablename__ = "room_types"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    name: Mapped[str] = mapped_column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    # Optional searchable abbreviation for reservation entry.
    # Example: DO, DR, TWIN, SUITE.
    code: Mapped[str | None] = mapped_column(
        String(30),
        unique=True,
        index=True,
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    reservation_rooms: Mapped[list["ReservationRoom"]] = relationship(
        "ReservationRoom",
        back_populates="room_type"
    )


# =========================================================
# Nationality
# =========================================================

class Nationality(Base):
    __tablename__ = "nationalities"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    code: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        index=True,
        nullable=False
    )

    name: Mapped[str] = mapped_column(
        String(100),
        index=True,
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )


# =========================================================
# Guest Count / Composition Master Data
# =========================================================

class GuestCountOption(Base):
    __tablename__ = "guest_count_options"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    adults: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    children: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0
    )

    code: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        index=True,
        nullable=False
    )

    label: Mapped[str] = mapped_column(
        String(100),
        index=True,
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )



# =========================================================
# Rate Plan
# =========================================================

class RatePlan(Base):
    __tablename__ = "rate_plans"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    code: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        index=True,
        nullable=False
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    meals: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    reservation_rooms: Mapped[list["ReservationRoom"]] = relationship(
        "ReservationRoom",
        back_populates="rate_plan"
    )


# =========================================================
# Hotel
# =========================================================

class Hotel(Base):
    __tablename__ = "hotels"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
        unique=True,
        index=True
    )

    email: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    phone: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    address: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    reservations: Mapped[list["Reservation"]] = relationship(
        "Reservation",
        back_populates="hotel"
    )

    attachments: Mapped[list["HotelAttachment"]] = relationship(
        "HotelAttachment",
        back_populates="hotel",
        cascade="all, delete-orphan",
        lazy="selectin"
    )


# =========================================================
# Hotel Attachments
# =========================================================

class HotelAttachment(Base):
    __tablename__ = "hotel_attachments"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    hotel_id: Mapped[int] = mapped_column(
        ForeignKey(
            "hotels.id",
            ondelete="CASCADE"
        ),
        nullable=False,
        index=True
    )

    original_filename: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    stored_filename: Mapped[str] = mapped_column(
        String,
        nullable=False,
        unique=True
    )

    content_type: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    file_size: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True
    )

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    hotel: Mapped["Hotel"] = relationship(
        "Hotel",
        back_populates="attachments"
    )


# =========================================================
# User
# =========================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    username: Mapped[str] = mapped_column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    password_hash: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    full_name: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    role: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=lambda: datetime.now(timezone.utc)
    )


# =========================================================
# Email Settings
# =========================================================


    permissions: Mapped[list["UserPermission"]] = relationship(
        "UserPermission",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

class EmailSettings(Base):
    __tablename__ = "email_settings"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    smtp_host: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="smtp.gmail.com"
    )

    smtp_port: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=587
    )

    smtp_username: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    smtp_password: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    smtp_from_email: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    smtp_use_tls: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )


# =========================================================
# Permissions
# =========================================================

class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    code: Mapped[str] = mapped_column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=lambda: datetime.now(timezone.utc)
    )


# =========================================================
# User Permissions
# =========================================================

class UserPermission(Base):
    __tablename__ = "user_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    permission_id: Mapped[int] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    granted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=lambda: datetime.now(timezone.utc)
    )

    granted_by: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="permissions"
    )

    permission: Mapped["Permission"] = relationship(
        "Permission"
    )

