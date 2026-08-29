"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  "https://hotel-reservation-backend.orkestr.run";

type Hotel = {
  id: number;
  name: string;
  email?: string | null;
};

type Reservation = {
  id: number;
  booking_number: string;
  hotel_id?: number | null;
  hotel?: Hotel | null;
  guest_name?: string | null;
  total_guest?: number | null;
  adult_count?: number | null;
  child_count?: number | null;
  guest_count_label?: string | null;
  nationality?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  nights?: number | null;
  payment_type?: string | null;
  payment_label?: string | null;
  rooms?: unknown[];
  room_count?: number | null;
  total_price_usd?: number | null;
  total_price_egp?: number | null;
  guest_requests?: string | null;
  status?: string | null;
  created_by?: string | null;
  hotel_confirmation_number?: string | null;
  email_status?: string | null;
  email_sent_at?: string | null;
  email_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Stats = {
  total: number;
  today: number;
  revenueUsd: number;
  noShow: number;
};

type CurrentUser = {
  id: number;
  username: string;
  full_name?: string | null;
  role: string;
  is_active?: boolean;
};

type Role = "Manager" | "IT" | "Reservation Employee";

function normalizeRole(role?: string | null): Role {
  const value = (role || "").trim().toLowerCase();

  if (value === "it") {
    return "IT";
  }

  if (
    value === "reservation employee" ||
    value === "reservation_employee" ||
    value === "reservation officer"
  ) {
    return "Reservation Employee";
  }

  return "Manager";
}

function normalizeStatus(status?: string | null) {
  return (status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isNoShow(status?: string | null) {
  const normalized = normalizeStatus(status);

  return (
    normalized === "no_show" ||
    normalized === "noshow" ||
    normalized === "no_show_" ||
    normalized === "no_showed"
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getReservationDateKey(value?: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return getLocalDateKey(parsed);
}

function getStatusLabel(status?: string | null) {
  const normalized = normalizeStatus(status);

  switch (normalized) {
    case "confirmed":
      return "Confirmed";

    case "pending":
      return "Pending";

    case "cancelled":
    case "canceled":
      return "Cancelled";

    case "no_show":
    case "noshow":
      return "No Show";

    case "completed":
      return "Completed";

    default:
      return status || "-";
  }
}

function getStatusClass(status?: string | null) {
  const normalized = normalizeStatus(status);

  switch (normalized) {
    case "confirmed":
      return "bg-green-500/10 text-green-300 border-green-500/20";

    case "pending":
      return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";

    case "cancelled":
    case "canceled":
    case "no_show":
    case "noshow":
      return "bg-red-500/10 text-red-300 border-red-500/20";

    case "completed":
      return "bg-teal-500/10 text-teal-300 border-teal-400/20";

    default:
      return "bg-[#35434D]/20 text-[#C2CDD5] border-[#40515D]/40";
  }
}

function formatGuestComposition(reservation: Reservation) {
  if (reservation.guest_count_label) {
    return reservation.guest_count_label;
  }

  const adults =
    reservation.adult_count ?? reservation.total_guest ?? 0;

  const children = reservation.child_count ?? 0;

  const parts: string[] = [];

  if (adults) {
    parts.push(
      `${adults} Adult${adults === 1 ? "" : "s"}`
    );
  }

  if (children) {
    parts.push(
      `${children} Child${children === 1 ? "" : "ren"}`
    );
  }

  return parts.join(" + ") || "0";
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [theme, setTheme] =
    useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("hotel_theme");
    const nextTheme =
      savedTheme === "light" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme =
      theme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("hotel_theme", nextTheme);
    setTheme(nextTheme);
  };

  const [reservations, setReservations] =
    useState<Reservation[]>([]);

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null);

  const [userLoading, setUserLoading] =
    useState(true);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [authError, setAuthError] =
    useState("");

  const loadCurrentUser = useCallback(async (): Promise<boolean> => {
    try {
      setUserLoading(true);
      setAuthError("");

      const response = await fetch(
        `${API_BASE_URL}/auth/me`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      // A protected Dashboard must never remain visible when there is
      // no valid authenticated session. Redirect only for an actual
      // authentication failure (401/403), while keeping temporary
      // network/server errors visible instead of logging the user out.
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("hotel_user");
        window.location.replace("/");
        return false;
      }

      if (!response.ok || !data?.user) {
        localStorage.removeItem("hotel_user");
        window.location.replace("/");
        return false;
      }

      setCurrentUser({
        id: Number(data.user.id),
        username: String(
          data.user.username || ""
        ),
        full_name:
          data.user.full_name ?? null,
        role: normalizeRole(data.user.role),
        is_active:
          data.user.is_active,
      });

      return true;
    } catch (sessionError) {
      // Any failed session verification must leave the protected dashboard.
      // This prevents the dashboard from becoming a blank page when the
      // browser cannot verify the session for any reason.
      setCurrentUser(null);
      setAuthError("");

      localStorage.removeItem("hotel_user");
      window.location.replace("/");
      return false;
    } finally {
      setUserLoading(false);
    }
  }, []);

  const loadReservations = useCallback(
    async (showRefreshing = false) => {
      try {
        if (showRefreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await fetch(
          `${API_BASE_URL}/reservations`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );

        if (!response.ok) {
          let message = `Failed to load reservations (${response.status})`;

          try {
            const data =
              await response.json();

            if (
              typeof data?.detail ===
              "string"
            ) {
              message = data.detail;
            }
          } catch {
            // Ignore JSON parse errors.
          }

          throw new Error(message);
        }

        const data =
          await response.json();

        if (!Array.isArray(data)) {
          throw new Error(
            "Invalid reservations response from the backend."
          );
        }

        setReservations(data);
      } catch (fetchError) {
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "An error occurred while loading reservations.";

        setError(message);
        setReservations([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const checkAuthenticationAndLoad = async (
      showRefreshing = false
    ) => {
      // Authentication is the gate for every protected dashboard request.
      const authenticated = await loadCurrentUser();

      if (cancelled || !authenticated) {
        return;
      }

      void loadReservations(showRefreshing);
    };

    void checkAuthenticationAndLoad(false);

    const interval = window.setInterval(() => {
      void checkAuthenticationAndLoad(true);
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadCurrentUser, loadReservations]);

  const stats = useMemo<Stats>(() => {
    const todayKey =
      getLocalDateKey(new Date());

    const todayReservations =
      reservations.filter(
        (reservation) => {
          return (
            getReservationDateKey(
              reservation.check_in
            ) === todayKey
          );
        }
      );

    const noShowReservations =
      reservations.filter(
        (reservation) => {
          return isNoShow(
            reservation.status
          );
        }
      );

    const revenueUsd =
      reservations.reduce(
        (sum, reservation) => {
          return (
            sum +
            Number(
              reservation.total_price_usd ||
                0
            )
          );
        },
        0
      );

    return {
      total: reservations.length,
      today:
        todayReservations.length,
      revenueUsd,
      noShow:
        noShowReservations.length,
    };
  }, [reservations]);

  const recentReservations =
    useMemo(() => {
      return [...reservations]
        .sort((a, b) => {
          const aTime = a.created_at
            ? new Date(
                a.created_at
              ).getTime()
            : Number(a.id || 0);

          const bTime = b.created_at
            ? new Date(
                b.created_at
              ).getTime()
            : Number(b.id || 0);

          const safeATime =
            Number.isNaN(aTime)
              ? Number(a.id || 0)
              : aTime;

          const safeBTime =
            Number.isNaN(bTime)
              ? Number(b.id || 0)
              : bTime;

          return safeBTime - safeATime;
        })
        .slice(0, 5);
    }, [reservations]);

  const currentRole =
    normalizeRole(
      currentUser?.role
    );

  const displayName =
    currentUser?.full_name?.trim() ||
    currentUser?.username ||
    "Current User";

  const canManageHotels =
    currentRole === "Manager" ||
    currentRole === "IT";

  const canManageUsers =
    currentRole === "Manager" ||
    currentRole === "IT";

  const canManageSettings =
    currentRole === "Manager" ||
    currentRole === "IT";

  const canManageMasterData =
    currentRole === "Manager" ||
    currentRole === "IT";

  // System Activation is IT only.
  const canManageActivation =
    currentRole === "IT";

  // Keep the protected dashboard hidden until the session is verified.
  // If the session is invalid, loadCurrentUser() redirects to the Sign In page.
  if (userLoading) {
    return (
      <main
        dir="ltr"
        className="flex min-h-screen items-center justify-center bg-[#0B1116] text-[#F3F7F9]"
      >
        <div className="text-center">
          <div className="text-4xl">🏨</div>
          <p className="mt-4 text-sm text-[#9AA8B3]">
            Checking your session...
          </p>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B1116]">
        <p className="text-sm text-[#9AA8B3]">Redirecting to sign in...</p>
      </main>
    );
  }

  const handleLogout = async () => {
    try {
      await fetch(
        `${API_BASE_URL}/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );
    } finally {
      localStorage.removeItem(
        "hotel_user"
      );

      window.location.href = "/";
    }
  };

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0B1116] text-[#F3F7F9]"
    >
      {/* Header */}
      <header className="fixed top-0 right-0 left-0 z-50 h-16 border-b border-[#2A3843] bg-[#141C23]/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() =>
                setSidebarOpen(
                  !sidebarOpen
                )
              }
              className="rounded-lg p-2 text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
              aria-label="Open or close menu"
            >
              ☰
            </button>

            <div>
              <h1 className="text-lg font-bold">
                Hotel Reservation System
              </h1>

              <p className="text-xs text-[#9AA8B3]">
                Hotel Reservation System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 items-center gap-2 rounded-lg border border-[#394B58] bg-[#111A21] px-3 text-xs font-medium text-[#D7E0E6] transition hover:bg-[#1B2730]"
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                theme === "dark"
                  ? "Light mode"
                  : "Dark mode"
              }
            >
              <span aria-hidden="true">
                {theme === "dark" ? "☀️" : "🌙"}
              </span>
              <span className="hidden sm:inline">
                {theme === "dark" ? "Light" : "Dark"}
              </span>
            </button>

            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold">
                {userLoading
                  ? "Loading..."
                  : displayName}
              </p>

              <p className="text-xs text-[#9AA8B3]">
                {userLoading
                  ? "Loading..."
                  : currentRole}
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 font-bold">
              {(
                displayName.trim()[0] ||
                "U"
              ).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-16 right-0 bottom-0 z-40 w-64 border-l border-[#2A3843] bg-[#141C23] transition-transform duration-300 ${
          sidebarOpen
            ? "translate-x-0"
            : "translate-x-full"
        }`}
      >
        <div className="relative h-full p-4">
          <div className="mb-6 rounded-xl border border-teal-400/20 bg-teal-500/10 p-4">
            <p className="text-xs text-[#9AA8B3]">
              Current User
            </p>

            <p className="mt-1 font-semibold">
              {userLoading
                ? "Loading..."
                : displayName}
            </p>

            <p className="mt-1 text-xs text-teal-400">
              {userLoading
                ? "Loading..."
                : currentRole}
            </p>
          </div>

          <nav className="space-y-2">
            <Link
              href="/dashboard"
              className="flex w-full items-center gap-3 rounded-xl bg-teal-600 px-4 py-3 text-right font-medium"
            >
              <span>📊</span>
              Dashboard
            </Link>

            <Link
              href="/reservations"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>📅</span>
              Reservations
            </Link>

            {canManageHotels && (
              <Link
                href="/hotels"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
              >
                <span>🏨</span>
                Hotels
              </Link>
            )}

            {canManageMasterData && (
              <Link
                href="/master-data"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
              >
                <span>🗂️</span>
                Master Data
              </Link>
            )}

            <Link
              href="/payments"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>💳</span>
              Payments
            </Link>

            <Link
              href="/no-show"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>🚫</span>
              No Show
            </Link>

            <Link
              href="/printed-reservations"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>🖨️</span>
              Printed Reservations
            </Link>

            {canManageUsers && (
              <Link
                href="/users"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
              >
                <span>👥</span>
                Users
              </Link>
            )}

            <Link
              href="/invoice-print"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>🧾</span>
              Print Invoice
            </Link>

            <Link
              href="/reports"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>📈</span>
              Reports
            </Link>

            {canManageSettings && (
              <Link
                href="/settings"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
              >
                <span>⚙️</span>
                Settings
              </Link>
            )}

            {/* IT ONLY */}
            {canManageActivation && (
              <Link
                href="/system-activation"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
              >
                <span>🔑</span>
                System Activation
              </Link>
            )}
          </nav>

          <div className="absolute bottom-5 right-4 left-4">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-red-400 transition hover:bg-red-500/10"
            >
              <span>🚪</span>
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <section
        className={`pt-24 transition-all duration-300 ${
          sidebarOpen
            ? "mr-64"
            : "mr-0"
        }`}
      >
        <div className="p-6">
          {/* Welcome */}
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Dashboard
              </h2>

              <p className="mt-1 text-sm text-[#9AA8B3]">
                Welcome to the Hotel Reservation System
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadReservations(true)
              }
              disabled={
                loading || refreshing
              }
              className="w-fit rounded-xl border border-[#394B58] bg-[#141C23] px-4 py-2 text-sm font-medium text-[#D7E0E6] transition hover:bg-[#1B2730] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing
                ? "Refreshing..."
                : "🔄 Refresh Data"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
              <p className="font-semibold">
                ❌ Could not load dashboard data
              </p>

              <p className="mt-1 text-red-200/80">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  loadReservations(true)
                }
                className="mt-3 rounded-lg border border-red-400/30 px-3 py-2 text-xs transition hover:bg-red-500/10"
              >
                Retry
              </button>
            </div>
          )}

          {/* Statistics */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#9AA8B3]">
                    Total Reservations
                  </p>

                  <p className="mt-2 text-3xl font-bold">
                    {loading
                      ? "..."
                      : stats.total}
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-2xl">
                  📅
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#9AA8B3]">
                    Today's Reservations
                  </p>

                  <p className="mt-2 text-3xl font-bold">
                    {loading
                      ? "..."
                      : stats.today}
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 text-2xl">
                  🟢
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#9AA8B3]">
                    Total Revenue
                  </p>

                  <p className="mt-2 text-3xl font-bold">
                    {loading
                      ? "..."
                      : `USD ${formatMoney(
                          stats.revenueUsd
                        )}`}
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/10 text-2xl">
                  💰
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#9AA8B3]">
                    No Show
                  </p>

                  <p className="mt-2 text-3xl font-bold">
                    {loading
                      ? "..."
                      : stats.noShow}
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-2xl">
                  🚫
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-7">
            <h3 className="mb-4 text-lg font-semibold">
              Quick Actions
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                href="/new-reservation"
                className="block rounded-2xl border border-[#2A3843] bg-[#141C23] p-5 text-right transition hover:border-teal-400/50 hover:bg-[#1B2730] focus:outline-none focus:ring-2 focus:ring-teal-400/50"
              >
                <div className="mb-3 text-3xl">
                  ➕
                </div>

                <p className="font-semibold">
                  New Reservation
                </p>

                <p className="mt-1 text-xs text-[#9AA8B3]">
                  Create a new reservation
                </p>
              </Link>

              <Link
                href="/reservations"
                className="block rounded-2xl border border-[#2A3843] bg-[#141C23] p-5 text-right transition hover:border-teal-400/50 hover:bg-[#1B2730] focus:outline-none focus:ring-2 focus:ring-teal-400/50"
              >
                <div className="mb-3 text-3xl">
                  🔎
                </div>

                <p className="font-semibold">
                  Find Reservation
                </p>

                <p className="mt-1 text-xs text-[#9AA8B3]">
                  Search by reservation number
                </p>
              </Link>

              {canManageHotels && (
                <Link
                  href="/hotels"
                  className="block rounded-2xl border border-[#2A3843] bg-[#141C23] p-5 text-right transition hover:border-teal-400/50 hover:bg-[#1B2730] focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                >
                  <div className="mb-3 text-3xl">
                    🏨
                  </div>

                  <p className="font-semibold">
                    Hotels
                  </p>

                  <p className="mt-1 text-xs text-[#9AA8B3]">
                    Manage hotels and rooms
                  </p>
                </Link>
              )}

              {canManageMasterData && (
                <Link
                  href="/master-data"
                  className="block rounded-2xl border border-[#2A3843] bg-[#141C23] p-5 text-right transition hover:border-teal-400/50 hover:bg-[#1B2730] focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                >
                  <div className="mb-3 text-3xl">
                    🗂️
                  </div>

                  <p className="font-semibold">
                    Master Data
                  </p>

                  <p className="mt-1 text-xs text-[#9AA8B3]">
                    Manage nationalities, rooms and guest counts
                  </p>
                </Link>
              )}

              <Link
                href="/invoice-print"
                className="block rounded-2xl border border-[#2A3843] bg-[#141C23] p-5 text-right transition hover:border-teal-400/50 hover:bg-[#1B2730] focus:outline-none focus:ring-2 focus:ring-teal-400/50"
              >
                <div className="mb-3 text-3xl">
                  🧾
                </div>

                <p className="font-semibold">
                  Print Invoice
                </p>

                <p className="mt-1 text-xs text-[#9AA8B3]">
                  Prepare and print the reservation invoice
                </p>
              </Link>

              <Link
                href="/reports"
                className="block rounded-2xl border border-[#2A3843] bg-[#141C23] p-5 text-right transition hover:border-teal-400/50 hover:bg-[#1B2730] focus:outline-none focus:ring-2 focus:ring-teal-400/50"
              >
                <div className="mb-3 text-3xl">
                  📈
                </div>

                <p className="font-semibold">
                  Reports
                </p>

                <p className="mt-1 text-xs text-[#9AA8B3]">
                  View reports and statistics
                </p>
              </Link>
            </div>
          </div>

          {/* Recent Reservations */}
          <div className="mt-7 rounded-2xl border border-[#2A3843] bg-[#141C23]">
            <div className="flex flex-col gap-3 border-b border-[#2A3843] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">
                  Recent Reservations
                </h3>

                <p className="mt-1 text-xs text-[#9AA8B3]">
                  Latest reservations recorded in the system
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-[#73828D]">
                  {loading
                    ? "Loading..."
                    : `${recentReservations.length} From the last ${reservations.length}`}
                </span>

                <Link
                  href="/reservations"
                  className="text-sm text-teal-400 hover:text-teal-300"
                >
                  View All
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center">
                <div className="text-4xl">
                  ⏳
                </div>

                <p className="mt-3 text-sm text-[#9AA8B3]">
                  Loading reservations...
                </p>
              </div>
            ) : recentReservations.length ===
              0 ? (
              <div className="p-10 text-center">
                <div className="text-4xl">
                  📋
                </div>

                <p className="mt-3 text-sm text-[#9AA8B3]">
                  No reservations currently
                </p>

                <p className="mt-1 text-xs text-[#73828D]">
                  Reservations will appear here once added
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="border-b border-[#2A3843] text-[#9AA8B3]">
                      <th className="px-5 py-4 text-right font-medium">
                        Booking Number
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Guest
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Hotel
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Check-in
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Amount
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Status
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Created At
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Details
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentReservations.map(
                      (reservation) => (
                        <tr
                          key={
                            reservation.id ||
                            reservation.booking_number
                          }
                          className="border-b border-[#26333D] transition hover:bg-[#1B2730]/45"
                        >
                          <td className="px-5 py-4 font-semibold text-teal-300">
                            {
                              reservation.booking_number
                            }
                          </td>

                          <td className="px-5 py-4">
                            <div>
                              {
                                reservation.guest_name ||
                                "-"
                              }
                            </div>

                            <div className="mt-1 text-xs text-[#73828D]">
                              {formatGuestComposition(
                                reservation
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            {
                              reservation.hotel
                                ?.name || "-"
                            }
                          </td>

                          <td className="px-5 py-4 text-[#C2CDD5]">
                            {formatDate(
                              reservation.check_in
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span className="font-semibold text-green-300">
                              USD{" "}
                              {formatMoney(
                                Number(
                                  reservation.total_price_usd ||
                                    0
                                )
                              )}
                            </span>

                            {reservation.total_price_egp !==
                              null &&
                              reservation.total_price_egp !==
                                undefined && (
                                <span className="mt-1 block text-xs text-[#73828D]">
                                  EGP{" "}
                                  {formatMoney(
                                    Number(
                                      reservation.total_price_egp ||
                                        0
                                    )
                                  )}
                                </span>
                              )}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
                                reservation.status
                              )}`}
                            >
                              {getStatusLabel(
                                reservation.status
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-[#9AA8B3]">
                            {formatDate(
                              reservation.created_at
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <Link
                              href={`/reservations/${encodeURIComponent(
                                reservation.booking_number
                              )}`}
                              className="inline-flex rounded-lg border border-[#394B58] px-3 py-2 text-xs text-[#D7E0E6] transition hover:bg-[#1B2730]"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}