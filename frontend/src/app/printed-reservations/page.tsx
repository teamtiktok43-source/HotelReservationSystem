"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";

type PrintedRecord = {
  id: number;
  reservation_id: number;
  booking_number: string;
  printed_by?: string | null;
  printed_at?: string | null;
};

type ReservationData = {
  id: number;
  booking_number: string;
  guest_name?: string | null;
  hotel?: {
    id: number;
    name: string;
    email?: string | null;
  } | null;
  check_in?: string | null;
  check_out?: string | null;
  total_price_usd?: number | null;
  total_price_egp?: number | null;
  status?: string | null;
};

type PrintedReservation = PrintedRecord & {
  guest_name?: string | null;
  hotel?: {
    id: number;
    name: string;
    email?: string | null;
  } | null;
  check_in?: string | null;
  check_out?: string | null;
  total_price_usd?: number | null;
  total_price_egp?: number | null;
  status?: string | null;
};

type Message = {
  type: "success" | "error";
  text: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function getStatusLabel(value?: string | null) {
  const status = (value || "").trim().toLowerCase();

  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "no_show":
      return "No Show";
    case "cancelled":
    case "canceled":
      return "Cancelled";
    case "pending":
      return "Pending";
    case "completed":
      return "Completed";
    default:
      return value || "-";
  }
}

function getStatusStyle(value?: string | null) {
  const status = (value || "").trim().toLowerCase();

  if (status === "confirmed") {
    return "border-green-500/20 bg-green-500/10 text-green-300";
  }

  if (status === "no_show") {
    return "border-red-500/20 bg-red-500/10 text-red-300";
  }

  if (status === "cancelled" || status === "canceled") {
    return "border-red-500/20 bg-red-500/10 text-red-300";
  }

  if (status === "pending") {
    return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
  }

  return "border-[#40515D]/40 bg-[#35434D]/20 text-[#C2CDD5]";
}

export default function PrintedReservationsPage() {
  const router = useRouter();

  const [records, setRecords] = useState<PrintedReservation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [printingBooking, setPrintingBooking] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const loadPrintedReservations = useCallback(
    async (showRefreshing = false) => {
      try {
        if (showRefreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setMessage(null);

        const data = await apiGet<PrintedRecord[]>(
          "/printed-reservations"
        );

        if (!Array.isArray(data)) {
          throw new Error(
            "Invalid print log response from the backend."
          );
        }

        const printRecords = data;

        const enrichedRecords = await Promise.all(
          printRecords.map(async (record) => {
            try {
              const reservation = await apiGet<ReservationData>(
                `/reservation/${encodeURIComponent(
                  record.booking_number
                )}`
              );

              return {
                ...record,
                guest_name: reservation.guest_name ?? null,
                hotel: reservation.hotel ?? null,
                check_in: reservation.check_in ?? null,
                check_out: reservation.check_out ?? null,
                total_price_usd:
                  reservation.total_price_usd ?? null,
                total_price_egp:
                  reservation.total_price_egp ?? null,
                status: reservation.status ?? null,
              };
            } catch {
              return {
                ...record,
              };
            }
          })
        );

        setRecords(enrichedRecords);
      } catch (error) {
        setMessage({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "An error occurred while loading the print log.",
        });

        setRecords([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadPrintedReservations();

    const interval = window.setInterval(() => {
      void loadPrintedReservations(true);
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadPrintedReservations]);

  const filteredRecords = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return records;
    }

    return records.filter((record) => {
      return (
        record.booking_number?.toLowerCase().includes(value) ||
        record.guest_name?.toLowerCase().includes(value) ||
        record.hotel?.name?.toLowerCase().includes(value) ||
        record.printed_by?.toLowerCase().includes(value)
      );
    });
  }, [records, search]);

  const bookingPrintCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const record of records) {
      counts.set(
        record.booking_number,
        (counts.get(record.booking_number) || 0) + 1
      );
    }

    return counts;
  }, [records]);

  const uniqueBookings = bookingPrintCounts.size;

  function openInvoicePrint(bookingNumber: string) {
    setPrintingBooking(bookingNumber);
    setMessage(null);

    router.push(
      `/invoice-print?booking=${encodeURIComponent(bookingNumber)}`
    );
  }

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0B1116] text-[#F3F7F9]"
    >
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
              <h2 className="text-2xl font-bold">
                🖨️ Printed Reservations
              </h2>

              <p className="mt-1 text-sm text-[#9AA8B3]">
                A complete log of reservation print and reprint operations
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => loadPrintedReservations(true)}
                disabled={loading || refreshing}
                className="rounded-xl border border-[#394B58] bg-[#141C23] px-4 py-3 text-sm font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "🔄 Refresh"}
              </button>

              <Link
                href="/reservations"
                className="rounded-xl bg-teal-600 px-5 py-3 font-semibold transition hover:bg-teal-500"
              >
                📅 Reservations
              </Link>
            </div>
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

          <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <p className="text-sm text-[#9AA8B3]">
                Total Print Operations
              </p>

              <p className="mt-2 text-3xl font-bold">
                {loading ? "..." : records.length}
              </p>
            </div>

            <div className="rounded-2xl border border-teal-400/20 bg-[#141C23] p-5">
              <p className="text-sm text-teal-300">
                Reservations Printed
              </p>

              <p className="mt-2 text-3xl font-bold text-teal-300">
                {loading ? "..." : uniqueBookings}
              </p>
            </div>

            <div className="rounded-2xl border border-green-500/20 bg-[#141C23] p-5">
              <p className="text-sm text-green-300">
                Last Print
              </p>

              <p className="mt-2 text-sm font-semibold text-green-300">
                {loading || records.length === 0
                  ? "-"
                  : formatDateTime(records[0].printed_at)}
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-500/20 bg-[#141C23] p-5">
              <p className="text-sm text-yellow-300">
                Results
              </p>

              <p className="mt-2 text-3xl font-bold text-yellow-300">
                {loading ? "..." : filteredRecords.length}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
            <label
              htmlFor="printed-search"
              className="text-sm text-[#9AA8B3]"
            >
              Search
            </label>

            <input
              id="printed-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Booking number, guest name, hotel, or user..."
              className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition placeholder:text-[#586874] focus:border-teal-400"
            />
          </div>

          {loading ? (
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-12 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#30404C] border-t-blue-500" />

              <p className="text-sm text-[#9AA8B3]">
                Loading print log...
              </p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-12 text-center">
              <div className="text-5xl">
                🖨️
              </div>

              <h3 className="mt-4 text-lg font-semibold">
                No print operations
              </h3>

              <p className="mt-2 text-sm text-[#9AA8B3]">
                Print records will appear here when a reservation is printed.
              </p>

              <Link
                href="/reservations"
                className="mt-6 inline-flex rounded-xl bg-teal-600 px-5 py-3 font-semibold hover:bg-teal-500"
              >
                Go to Reservations
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#2A3843] bg-[#141C23]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead className="border-b border-[#2A3843] bg-[#1B2730]/70">
                    <tr>
                      <th className="px-5 py-4 text-right">
                        Booking Number
                      </th>

                      <th className="px-5 py-4 text-right">
                        Guest
                      </th>

                      <th className="px-5 py-4 text-right">
                        Hotel
                      </th>

                      <th className="px-5 py-4 text-right">
                        Price USD
                      </th>

                      <th className="px-5 py-4 text-right">
                        Status
                      </th>

                      <th className="px-5 py-4 text-right">
                        Printed By
                      </th>

                      <th className="px-5 py-4 text-right">
                        Print Date
                      </th>

                      <th className="px-5 py-4 text-right">
                        Print Count
                      </th>

                      <th className="px-5 py-4 text-center">
                        Reprint
                      </th>

                      <th className="px-5 py-4 text-center">
                        Details
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRecords.map((record) => (
                      <tr
                        key={record.id}
                        className="border-b border-[#26333D] hover:bg-[#1B2730]/45"
                      >
                        <td className="px-5 py-4 font-semibold text-teal-300">
                          {record.booking_number}
                        </td>

                        <td className="px-5 py-4">
                          {record.guest_name || "-"}
                        </td>

                        <td className="px-5 py-4">
                          {record.hotel?.name || "-"}
                        </td>

                        <td className="px-5 py-4 font-semibold text-green-300">
                          ${formatMoney(record.total_price_usd)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusStyle(
                              record.status
                            )}`}
                          >
                            {getStatusLabel(record.status)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-[#C2CDD5]">
                          {record.printed_by || "-"}
                        </td>

                        <td className="px-5 py-4 text-[#C2CDD5]">
                          {formatDateTime(record.printed_at)}
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-flex min-w-10 justify-center rounded-full border border-teal-400/20 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-300">
                            {bookingPrintCounts.get(
                              record.booking_number
                            ) || 0}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              openInvoicePrint(
                                record.booking_number
                              )
                            }
                            disabled={
                              printingBooking ===
                              record.booking_number
                            }
                            className="rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-300 transition hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {printingBooking ===
                            record.booking_number
                              ? "Opening..."
                              : "🖨️ Print"}
                          </button>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <Link
                            href={`/reservations/${encodeURIComponent(
                              record.booking_number
                            )}`}
                            className="rounded-lg border border-[#394B58] px-3 py-2 text-xs text-[#C2CDD5] transition hover:border-teal-400 hover:bg-teal-500/10 hover:text-teal-300"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
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
