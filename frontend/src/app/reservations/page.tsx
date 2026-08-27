"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/api";


type Hotel = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type Reservation = {
  id: number;
  booking_number: string;
  hotel_id: number | null;
  hotel?: Hotel | null;
  guest_name: string | null;
  total_guest: number | null;
  adult_count?: number | null;
  child_count?: number | null;
  guest_count_label?: string | null;
  nationality: string | null;
  check_in: string | null;
  check_out: string | null;
  nights?: number | null;
  payment_type?: string | null;
  payment_label?: string | null;
  rooms?: unknown[];
  room_count?: number | null;
  total_price_usd?: number | string | null;
  total_price_egp?: number | string | null;
  guest_requests?: string | null;
  status: string | null;
  created_by?: string | null;
  hotel_confirmation_number?: string | null;
  email_status?: string | null;
  email_sent_at?: string | null;
  email_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizeStatus(status?: string | null) {
  return (status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getStatusLabel(status?: string | null) {
  const value = normalizeStatus(status);

  switch (value) {
    case "confirmed":
      return "Confirmed";

    case "cancelled":
    case "canceled":
      return "Cancelled";

    case "pending":
      return "Pending";

    case "no_show":
    case "noshow":
      return "No Show";

    case "completed":
      return "Completed";

    default:
      return status || "Not specified";
  }
}

function getStatusStyle(status?: string | null) {
  const value = normalizeStatus(status);

  if (value === "confirmed") {
    return "bg-green-500/10 text-green-400 border-green-500/20";
  }

  if (value === "cancelled" || value === "canceled") {
    return "bg-red-500/10 text-red-400 border-red-500/20";
  }

  if (value === "pending") {
    return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  }

  if (value === "no_show" || value === "noshow") {
    return "bg-red-500/10 text-red-300 border-red-500/30";
  }

  if (value === "completed") {
    return "bg-teal-500/10 text-teal-400 border-teal-400/20";
  }

  return "bg-[#35434D]/20 text-[#C2CDD5] border-[#40515D]/40";
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
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

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numberValue);
}

function formatGuestComposition(reservation: Reservation) {
  if (reservation.guest_count_label) return reservation.guest_count_label;
  const adults = reservation.adult_count ?? reservation.total_guest ?? 0;
  const children = reservation.child_count ?? 0;
  const parts: string[] = [];
  if (adults) parts.push(`${adults} Adult${adults === 1 ? "" : "s"}`);
  if (children) parts.push(`${children} Child${children === 1 ? "" : "ren"}`);
  return parts.join(" + ") || "0";
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [search, setSearch] = useState("");
  const [hotelFilter, setHotelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const [reservationsData, hotelsData] = await Promise.all([
        apiGet<Reservation[]>("/reservations"),
        apiGet<Hotel[]>("/hotels"),
      ]);

      if (!Array.isArray(reservationsData)) {
        throw new Error("Invalid reservations response from the backend.");
      }

      if (!Array.isArray(hotelsData)) {
        throw new Error("Invalid hotels response from the backend.");
      }

      setReservations(reservationsData);
      setHotels(hotelsData);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not load data. Make sure the backend is running."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const interval = window.setInterval(() => {
      void loadData(true);
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadData]);

  const filteredReservations = useMemo(() => {
    const value = search.trim().toLowerCase();

    return reservations.filter((reservation) => {
      const matchesSearch =
        !value ||
        reservation.booking_number?.toLowerCase().includes(value) ||
        reservation.guest_name?.toLowerCase().includes(value) ||
        reservation.nationality?.toLowerCase().includes(value) ||
        reservation.hotel?.name?.toLowerCase().includes(value);

      const matchesHotel =
        hotelFilter === "all" ||
        String(reservation.hotel_id ?? "") === hotelFilter;

      const matchesStatus =
        statusFilter === "all" ||
        normalizeStatus(reservation.status) ===
          normalizeStatus(statusFilter);

      return matchesSearch && matchesHotel && matchesStatus;
    });
  }, [reservations, search, hotelFilter, statusFilter]);

  const stats = useMemo(() => {
    const noShowCount = reservations.filter((reservation) => {
      const status = normalizeStatus(reservation.status);
      return status === "no_show" || status === "noshow";
    }).length;

    const confirmedCount = reservations.filter(
      (reservation) =>
        normalizeStatus(reservation.status) === "confirmed"
    ).length;

    const cancelledCount = reservations.filter((reservation) => {
      const status = normalizeStatus(reservation.status);
      return status === "cancelled" || status === "canceled";
    }).length;

    const totalRevenueUsd = reservations.reduce(
      (sum, reservation) =>
        sum + Number(reservation.total_price_usd || 0),
      0
    );

    return {
      total: reservations.length,
      confirmed: confirmedCount,
      noShow: noShowCount,
      cancelled: cancelledCount,
      totalRevenueUsd,
    };
  }, [reservations]);

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0B1116] text-[#F3F7F9]"
    >
      {/* Header */}
      <header className="fixed top-0 right-0 left-0 z-50 h-16 border-b border-[#2A3843] bg-[#141C23]/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              ←
            </Link>

            <div>
              <h1 className="text-lg font-bold">
                Hotel Reservation System
              </h1>

              <p className="text-xs text-[#9AA8B3]">
                Reservations Management
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="text-sm text-teal-400 transition hover:text-teal-300"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="fixed top-16 right-0 bottom-0 z-40 hidden w-64 border-l border-[#2A3843] bg-[#141C23] lg:block">
        <div className="relative h-full p-4">
          <div className="mb-6 rounded-xl border border-teal-400/20 bg-teal-500/10 p-4">
            <p className="text-xs text-[#9AA8B3]">
              Current User
            </p>

            <p className="mt-1 font-semibold">
              Mostafa Amer
            </p>

            <p className="mt-1 text-xs text-teal-400">
              Administrator
            </p>
          </div>

          <nav className="space-y-2">
            <Link
              href="/dashboard"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>📊</span>
              Dashboard
            </Link>

            <Link
              href="/reservations"
              className="flex w-full items-center gap-3 rounded-xl bg-teal-600 px-4 py-3 text-right font-medium"
            >
              <span>📅</span>
              Reservations
            </Link>

            <Link
              href="/hotels"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>🏨</span>
              Hotels
            </Link>

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

            <Link
              href="/users"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>👥</span>
              Users
            </Link>

            <Link
              href="/settings"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              <span>⚙️</span>
              Settings
            </Link>
          </nav>

          <button
            type="button"
            className="absolute bottom-5 right-4 left-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-xl px-4 py-3 text-right text-red-400 transition hover:bg-red-500/10"
          >
            <span>🚪</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <section className="pt-24 lg:mr-64">
        <div className="p-6">
          {/* Title */}
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Reservations
              </h2>

              <p className="mt-1 text-sm text-[#9AA8B3]">
                View and manage all reservations
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={loading || refreshing}
                className="rounded-xl border border-[#394B58] bg-[#141C23] px-4 py-3 text-sm font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "🔄 Refresh"}
              </button>

              <Link
                href="/new-reservation"
                className="rounded-xl bg-teal-600 px-5 py-3 font-semibold transition hover:bg-teal-500"
              >
                ➕ New Reservation
              </Link>
            </div>
          </div>

          {/* Search / Filters / Stats */}
          <div className="mb-6 grid gap-4 xl:grid-cols-5">
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <p className="text-sm text-[#9AA8B3]">
                Total Reservations
              </p>

              <p className="mt-2 text-3xl font-bold">
                {loading ? "..." : stats.total}
              </p>
            </div>

            <div className="rounded-2xl border border-green-500/20 bg-[#141C23] p-5">
              <p className="text-sm text-green-300">
                Confirmed Reservations
              </p>

              <p className="mt-2 text-3xl font-bold text-green-300">
                {loading ? "..." : stats.confirmed}
              </p>
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-[#141C23] p-5">
              <p className="text-sm text-red-300">
                No Show
              </p>

              <p className="mt-2 text-3xl font-bold text-red-300">
                {loading ? "..." : stats.noShow}
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-500/20 bg-[#141C23] p-5">
              <p className="text-sm text-yellow-300">
                Cancelled Reservations
              </p>

              <p className="mt-2 text-3xl font-bold text-yellow-300">
                {loading ? "..." : stats.cancelled}
              </p>
            </div>

            <div className="rounded-2xl border border-teal-400/20 bg-[#141C23] p-5">
              <p className="text-sm text-teal-300">
                Revenue
              </p>

              <p className="mt-2 text-2xl font-bold text-teal-300">
                {loading
                  ? "..."
                  : `USD ${formatMoney(stats.totalRevenueUsd)}`}
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            {/* Search */}
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5 lg:col-span-1">
              <label
                htmlFor="reservation-search"
                className="text-sm text-[#9AA8B3]"
              >
                Search
              </label>

              <input
                id="reservation-search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Booking Number, Guest Name, or Hotel..."
                className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition placeholder:text-[#586874] focus:border-teal-400"
              />
            </div>

            {/* Hotel filter */}
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <label
                htmlFor="hotel-filter"
                className="text-sm text-[#9AA8B3]"
              >
                Hotel
              </label>

              <select
                id="hotel-filter"
                value={hotelFilter}
                onChange={(event) =>
                  setHotelFilter(event.target.value)
                }
                className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition focus:border-teal-400"
              >
                <option value="all">
                  All Hotels
                </option>

                {hotels.map((hotel) => (
                  <option
                    key={hotel.id}
                    value={String(hotel.id)}
                  >
                    {hotel.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <label
                htmlFor="status-filter"
                className="text-sm text-[#9AA8B3]"
              >
                Status
              </label>

              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition focus:border-teal-400"
              >
                <option value="all">
                  All Statuses
                </option>

                <option value="confirmed">
                  Confirmed
                </option>

                <option value="no_show">
                  No Show
                </option>

                <option value="cancelled">
                  Cancelled
                </option>

                <option value="pending">
                  Pending
                </option>

                <option value="completed">
                  Completed
                </option>
              </select>
            </div>
          </div>

          {/* Current Results */}
          <div className="mb-5 flex items-center justify-between rounded-xl border border-[#2A3843] bg-[#141C23] px-5 py-4">
            <div className="text-sm text-[#9AA8B3]">
              Current Results
            </div>

            <div className="text-sm font-semibold text-[#F3F7F9]">
              {loading
                ? "Loading..."
                : `${filteredReservations.length} From ${reservations.length}`}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <p>{error}</p>

              <button
                type="button"
                onClick={() => loadData(true)}
                className="mt-3 rounded-lg border border-red-400/30 px-3 py-2 text-xs transition hover:bg-red-500/10"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-12 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#30404C] border-t-blue-500" />

              <p className="text-sm text-[#9AA8B3]">
                Loading reservations...
              </p>
            </div>
          )}

          {/* Empty */}
          {!loading &&
            !error &&
            filteredReservations.length === 0 && (
              <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-16 text-center">
                <div className="text-5xl">
                  📋
                </div>

                <h3 className="mt-4 text-lg font-semibold">
                  {reservations.length === 0
                    ? "No reservations"
                    : "No results"}
                </h3>

                <p className="mt-2 text-sm text-[#9AA8B3]">
                  {reservations.length === 0
                    ? "No reservations have been recorded in the system yet."
                    : "Try changing the current search or filters."}
                </p>

                {reservations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setHotelFilter("all");
                      setStatusFilter("all");
                    }}
                    className="mt-5 rounded-xl border border-[#394B58] px-5 py-3 text-sm text-[#D7E0E6] transition hover:bg-[#1B2730]"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            )}

          {/* Reservations Table */}
          {!loading &&
            !error &&
            filteredReservations.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-[#2A3843] bg-[#141C23]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-sm">
                    <thead className="border-b border-[#2A3843] bg-[#1B2730]/70">
                      <tr>
                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Booking Number
                        </th>

                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Guest Name
                        </th>

                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Hotel
                        </th>

                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Check-in
                        </th>

                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Check-out
                        </th>

                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Guests
                        </th>

                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Price
                        </th>

                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Payment Method
                        </th>

                        <th className="px-5 py-4 text-right font-semibold text-[#C2CDD5]">
                          Status
                        </th>

                        <th className="px-5 py-4 text-center font-semibold text-[#C2CDD5]">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredReservations.map(
                        (reservation) => (
                          <tr
                            key={reservation.id}
                            className="border-b border-[#26333D] transition hover:bg-[#1B2730]/70"
                          >
                            <td className="px-5 py-4 font-semibold text-teal-400">
                              {reservation.booking_number}
                            </td>

                            <td className="px-5 py-4 text-[#F3F7F9]">
                              {reservation.guest_name || "-"}
                            </td>

                            <td className="px-5 py-4">
                              <div className="font-medium text-[#D7E0E6]">
                                {reservation.hotel?.name || "-"}
                              </div>

                              {reservation.hotel?.email && (
                                <div className="mt-1 text-xs text-[#73828D]">
                                  {reservation.hotel.email}
                                </div>
                              )}
                            </td>

                            <td className="px-5 py-4 text-[#C2CDD5]">
                              {formatDate(
                                reservation.check_in
                              )}
                            </td>

                            <td className="px-5 py-4 text-[#C2CDD5]">
                              {formatDate(
                                reservation.check_out
                              )}
                            </td>

                            <td className="px-5 py-4 text-[#C2CDD5]">
                              {formatGuestComposition(reservation)}
                            </td>

                            <td className="px-5 py-4">
                              <div className="font-semibold text-green-300">
                                USD{" "}
                                {formatMoney(
                                  reservation.total_price_usd
                                )}
                              </div>

                              {reservation.total_price_egp !==
                                null &&
                                reservation.total_price_egp !==
                                  undefined && (
                                  <div className="mt-1 text-xs text-[#73828D]">
                                    EGP{" "}
                                    {formatMoney(
                                      reservation.total_price_egp
                                    )}
                                  </div>
                                )}
                            </td>

                            <td className="px-5 py-4 text-[#C2CDD5]">
                              {reservation.payment_label ||
                                reservation.payment_type ||
                                "-"}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-lg border px-3 py-1 text-xs font-medium ${getStatusStyle(
                                  reservation.status
                                )}`}
                              >
                                {getStatusLabel(
                                  reservation.status
                                )}
                              </span>
                            </td>

                            <td className="px-5 py-4 text-center">
                              <Link
                                href={`/reservations/${encodeURIComponent(
                                  reservation.booking_number
                                )}`}
                                className="rounded-lg border border-[#394B58] px-3 py-2 text-xs text-[#C2CDD5] transition hover:border-teal-400 hover:bg-teal-500/10 hover:text-teal-400"
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
              </div>
            )}
        </div>
      </section>
    </main>
  );
}
