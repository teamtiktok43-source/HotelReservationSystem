// frontend/src/app/lib/api.ts

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://localhost:8000";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;

  /**
   * Set to true when sending FormData/file uploads.
   * In that case Content-Type is left to the browser.
   */
  isFormData?: boolean;
};

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(
    message: string,
    status: number,
    detail?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function parseResponseBody(response: Response) {
  const contentType =
    response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => "");
}

function getErrorMessage(
  data: unknown,
  status: number
) {
  if (
    typeof data === "string" &&
    data.trim()
  ) {
    return data;
  }

  if (
    data &&
    typeof data === "object" &&
    "detail" in data &&
    typeof (data as { detail?: unknown }).detail ===
      "string"
  ) {
    return (data as { detail: string }).detail;
  }

  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof (data as { message?: unknown }).message ===
      "string"
  ) {
    return (data as { message: string }).message;
  }

  switch (status) {
    case 400:
      return "Bad request";

    case 401:
      return "Unauthorized";

    case 403:
      return "Forbidden";

    case 404:
      return "Not found";

    case 409:
      return "Conflict";

    case 422:
      return "Validation error";

    case 423:
      return "System license expired";

    case 500:
      return "Internal server error";

    default:
      return `Request failed (${status})`;
  }
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  return `${API_BASE_URL}${normalizedPath}`;
}

function prepareBody(
  body: unknown,
  isFormData = false
): BodyInit | undefined {
  if (
    body === undefined ||
    body === null
  ) {
    return undefined;
  }

  if (
    isFormData ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    typeof body === "string"
  ) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    body,
    headers,
    isFormData = false,
    ...requestInit
  } = options;

  const requestHeaders = new Headers(headers);

  const preparedBody = prepareBody(
    body,
    isFormData
  );

  if (
    preparedBody !== undefined &&
    !isFormData &&
    !requestHeaders.has("Content-Type") &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    typeof body !== "string"
  ) {
    requestHeaders.set(
      "Content-Type",
      "application/json"
    );
  }

  const response = await fetch(
    buildUrl(path),
    {
      ...requestInit,
      credentials: "include",
      headers: requestHeaders,
      body: preparedBody,
      cache:
        requestInit.cache ?? "no-store",
    }
  );

  const data =
    await parseResponseBody(response);

  if (!response.ok) {
    const detail =
      data &&
      typeof data === "object" &&
      "detail" in data &&
      typeof (
        data as {
          detail?: unknown;
        }
      ).detail === "string"
        ? (
            data as {
              detail: string;
            }
          ).detail
        : undefined;

    throw new ApiError(
      getErrorMessage(
        data,
        response.status
      ),
      response.status,
      detail
    );
  }

  return data as T;
}

export function apiGet<T = unknown>(
  path: string,
  options: Omit<
    RequestOptions,
    "method" | "body"
  > = {}
) {
  return apiFetch<T>(path, {
    ...options,
    method: "GET",
  });
}

export function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  options: Omit<
    RequestOptions,
    "method" | "body"
  > = {}
) {
  return apiFetch<T>(path, {
    ...options,
    method: "POST",
    body,
  });
}

export function apiPut<T = unknown>(
  path: string,
  body?: unknown,
  options: Omit<
    RequestOptions,
    "method" | "body"
  > = {}
) {
  return apiFetch<T>(path, {
    ...options,
    method: "PUT",
    body,
  });
}

export function apiPatch<T = unknown>(
  path: string,
  body?: unknown,
  options: Omit<
    RequestOptions,
    "method" | "body"
  > = {}
) {
  return apiFetch<T>(path, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function apiDelete<T = unknown>(
  path: string,
  options: Omit<
    RequestOptions,
    "method" | "body"
  > = {}
) {
  return apiFetch<T>(path, {
    ...options,
    method: "DELETE",
  });
}

/**
 * =========================================================
 * Authentication
 * =========================================================
 */

export type CurrentUser = {
  id: number;
  username: string;
  full_name?: string | null;
  role: string;
  is_active?: boolean;
};

export async function getCurrentUser() {
  return apiGet<{
    user: CurrentUser;
  }>("/auth/me");
}

export async function login(
  username: string,
  password: string
) {
  return apiPost<{
    success: boolean;
    message: string;
    user: CurrentUser;
  }>("/login", {
    username: username.trim(),
    password,
  });
}

export async function logout() {
  return apiPost<{
    success: boolean;
    message: string;
  }>("/logout");
}

/**
 * Convenience helper for frontend code
 * that needs to redirect on auth loss.
 *
 * The backend remains the source of truth.
 * This helper only clears the temporary local
 * copy used by the UI.
 */
export function clearLocalUser() {
  if (
    typeof window !== "undefined"
  ) {
    localStorage.removeItem(
      "hotel_user"
    );
  }
}

export function saveLocalUser(
  user: CurrentUser
) {
  if (
    typeof window !== "undefined"
  ) {
    localStorage.setItem(
      "hotel_user",
      JSON.stringify(user)
    );
  }
}

/**
 * =========================================================
 * System License
 * =========================================================
 *
 * Backend endpoints:
 *
 * GET  /license/status
 * POST /license/generate
 * POST /license/activate
 *
 * License status is available to all
 * authenticated users.
 *
 * Generate / Activate are IT-only.
 */

/**
 * Current system license status.
 */
export type LicenseStatus = {
  active: boolean;
  activated_at: string | null;
  expires_at: string | null;
  days_remaining: number;
  message: string;
};

/**
 * GET /license/status
 */
export async function getLicenseStatus() {
  return apiGet<LicenseStatus>(
    "/license/status"
  );
}

/**
 * Response from POST /license/generate
 *
 * The backend intentionally returns the
 * activation code only once.
 */
export type LicenseGenerateResponse = {
  success: boolean;
  message: string;
  code: string;
  valid_for_days: number;
};

/**
 * Generate a new activation code.
 *
 * IT users only.
 */
export async function generateLicenseCode() {
  return apiPost<LicenseGenerateResponse>(
    "/license/generate"
  );
}

/**
 * Response from POST /license/activate
 */
export type LicenseActivateResponse = {
  success: boolean;
  message: string;
  activated_at: string;
  expires_at: string;
  days: number;
};

/**
 * Activate the system using an activation code.
 *
 * IT users only.
 */
export async function activateLicense(
  code: string
) {
  return apiPost<LicenseActivateResponse>(
    "/license/activate",
    {
      code: code.trim(),
    }
  );
}

/**
 * =========================================================
 * API BASE URL
 * =========================================================
 */

export { API_BASE_URL };