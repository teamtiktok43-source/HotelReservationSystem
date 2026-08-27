"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "../lib/api";

type Reservation = {
  id: number;
  booking_number: string;
  hotel?: {
    id: number;
    name: string;
    email?: string | null;
  } | null;
  guest_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  total_guest?: number | null;
  room_count?: number | null;
  total_price_usd?: number | null;
  total_price_egp?: number | null;
  status?: string | null;
  created_at?: string | null;
};

type Message = {
  type: "success" | "error";
  text: string;
};

function normalizeStatus(status?: string | null) {
  return (status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isNoShow(status?: string | null) {
  const value = normalizeStatus(status);
  return value === "no_show" || value === "noshow";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "-";

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

export default function NoShowPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingBooking, setUpdatingBooking] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const loadReservations = useCallback(async () => {
    try {
      setLoading(true);

      const data = await apiGet<Reservation[]>(
        "/reservations"
      );

      if (!Array.isArray(data)) {
        throw new Error("Invalid reservations response.");
      }

      setReservations(data);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while loading reservations.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  const noShowReservations = useMemo(() => {
    return reservations.filter((reservation) =>
      isNoShow(reservation.status)
    );
  }, [reservations]);

  const activeReservations = useMemo(() => {
    return reservations.filter(
      (reservation) => !isNoShow(reservation.status)
    );
  }, [reservations]);

  async function changeStatus(
    bookingNumber: string,
    status: "no_show" | "confirmed"
  ) {
    try {
      setUpdatingBooking(bookingNumber);
      setMessage(null);

      await apiPatch<{
        success?: boolean;
        message?: string;
      }>(
        `/reservation/${encodeURIComponent(
          bookingNumber
        )}/status`,
        { status }
      );

      setMessage({
        type: "success",
        text:
          status === "no_show"
            ? `Reservation ${bookingNumber} changed to No Show.`
            : `Reservation ${bookingNumber} restored to Confirmed.`,
      });

      await loadReservations();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while updating reservation status.",
      });
    } finally {
      setUpdatingBooking(null);
    }
  }

  return (
    <main dir="ltr" className="min-h-screen bg-[#0B1116] text-[#F3F7F9]">
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
                Hotel Reservation System
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="text-sm text-teal-400 hover:text-teal-300"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <section className="pt-24">
        <div className="p-6">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">🚫 No Show</h2>
              <p className="mt-1 text-sm text-[#9AA8B3]">
                Manage no-show status and link it to actual reservations
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadReservations()}
              disabled={loading}
              className="w-fit rounded-xl border border-[#394B58] bg-[#141C23] px-4 py-3 text-sm font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "🔄 Refresh"}
            </button>
          </div>

          {message && (
            <div
              className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
                message.type === "success"
                  ? "border-green-500/30 bg-green-500/10 text-green-300"
                  : "border-red-500/30 bg-red-500/10 text-red-300"
              }`}
            >
              {message.type === "success" ? "✅ " : "❌ "}
              {message.text}
            </div>
          )}

          <div className="mb-6 grid gap-5 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <p className="text-sm text-[#9AA8B3]">Total Reservations</p>
              <p className="mt-2 text-3xl font-bold">
                {loading ? "..." : reservations.length}
              </p>
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <p className="text-sm text-red-300">No Show</p>
              <p className="mt-2 text-3xl font-bold text-red-200">
                {loading ? "..." : noShowReservations.length}
              </p>
            </div>

            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5">
              <p className="text-sm text-green-300">Active Reservations</p>
              <p className="mt-2 text-3xl font-bold text-green-200">
                {loading ? "..." : activeReservations.length}
              </p>
            </div>
          </div>

          <section className="mb-6 rounded-2xl border border-red-500/20 bg-[#141C23]">
            <div className="border-b border-[#2A3843] p-5">
              <h3 className="font-semibold">Reservations marked as No Show</h3>
              <p className="mt-1 text-xs text-[#9AA8B3]">
                Reservations whose status was changed to No Show
              </p>
            </div>

            {loading ? (
              <div className="p-10 text-center text-[#9AA8B3]">
                Loading...
              </div>
            ) : noShowReservations.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-4xl">✅</div>
                <p className="mt-3 text-sm text-[#9AA8B3]">
                  No No Show reservations currently
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-[#2A3843] text-[#9AA8B3]">
                      <th className="px-5 py-4 text-right">Booking Number</th>
                      <th className="px-5 py-4 text-right">Guest</th>
                      <th className="px-5 py-4 text-right">Hotel</th>
                      <th className="px-5 py-4 text-right">Check-in</th>
                      <th className="px-5 py-4 text-right">Amount</th>
                      <th className="px-5 py-4 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {noShowReservations.map((reservation) => (
                      <tr
                        key={reservation.id}
                        className="border-b border-[#26333D] hover:bg-[#1B2730]/45"
                      >
                        <td className="px-5 py-4 font-semibold text-teal-300">
                          {reservation.booking_number}
                        </td>

                        <td className="px-5 py-4">
                          {reservation.guest_name || "-"}
                        </td>

                        <td className="px-5 py-4">
                          {reservation.hotel?.name || "-"}
                        </td>

                        <td className="px-5 py-4 text-[#C2CDD5]">
                          {formatDate(reservation.check_in)}
                        </td>

                        <td className="px-5 py-4 text-green-300">
                          USD{" "}
                          {formatMoney(
                            Number(reservation.total_price_usd || 0)
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              changeStatus(
                                reservation.booking_number,
                                "confirmed"
                              )
                            }
                            disabled={
                              updatingBooking ===
                              reservation.booking_number
                            }
                            className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-300 transition hover:bg-green-500/20 disabled:opacity-50"
                          >
                            {updatingBooking ===
                            reservation.booking_number
                              ? "Refreshing..."
                              : "Restore as Confirmed"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#2A3843] bg-[#141C23]">
            <div className="border-b border-[#2A3843] p-5">
              <h3 className="font-semibold">Reservations available to mark as No Show</h3>
              <p className="mt-1 text-xs text-[#9AA8B3]">
                Select a reservation to mark it as No Show
              </p>
            </div>

            {loading ? (
              <div className="p-10 text-center text-[#9AA8B3]">
                Loading...
              </div>
            ) : activeReservations.length === 0 ? (
              <div className="p-10 text-center text-[#9AA8B3]">
                No reservations available.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="border-b border-[#2A3843] text-[#9AA8B3]">
                      <th className="px-5 py-4 text-right">Booking Number</th>
                      <th className="px-5 py-4 text-right">Guest</th>
                      <th className="px-5 py-4 text-right">Hotel</th>
                      <th className="px-5 py-4 text-right">Check-in</th>
                      <th className="px-5 py-4 text-right">Check-out</th>
                      <th className="px-5 py-4 text-right">Status</th>
                      <th className="px-5 py-4 text-right">Amount</th>
                      <th className="px-5 py-4 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {activeReservations.map((reservation) => (
                      <tr
                        key={reservation.id}
                        className="border-b border-[#26333D] hover:bg-[#1B2730]/45"
                      >
                        <td className="px-5 py-4 font-semibold text-teal-300">
                          {reservation.booking_number}
                        </td>

                        <td className="px-5 py-4">
                          {reservation.guest_name || "-"}
                        </td>

                        <td className="px-5 py-4">
                          {reservation.hotel?.name || "-"}
                        </td>

                        <td className="px-5 py-4 text-[#C2CDD5]">
                          {formatDate(reservation.check_in)}
                        </td>

                        <td className="px-5 py-4 text-[#C2CDD5]">
                          {formatDate(reservation.check_out)}
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-300">
                            {reservation.status || "confirmed"}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-green-300">
                          USD{" "}
                          {formatMoney(
                            Number(reservation.total_price_usd || 0)
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              changeStatus(
                                reservation.booking_number,
                                "no_show"
                              )
                            }
                            disabled={
                              updatingBooking ===
                              reservation.booking_number
                            }
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            {updatingBooking ===
                            reservation.booking_number
                              ? "Refreshing..."
                              : "🚫 No Show"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/reservations"
              className="rounded-xl bg-teal-600 px-5 py-3 font-semibold transition hover:bg-teal-500"
            >
              📅 Reservations
            </Link>

            <Link
              href="/dashboard"
              className="rounded-xl border border-[#30404C] px-5 py-3 text-[#C2CDD5] transition hover:bg-[#1B2730]"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
