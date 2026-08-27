"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";

type Hotel = {
  id: number;
  name: string;
  email?: string | null;
};

type Reservation = {
  id: number;
  booking_number: string;
  hotel_id: number | null;
  hotel?: Hotel | null;
  guest_name?: string | null;
  total_guest?: number | null;
  nationality?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  nights?: number | null;
  payment_type?: string | null;
  payment_label?: string | null;
  total_price_usd?: number | string | null;
  total_price_egp?: number | string | null;
  status?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

type DateRange = {
  from: string;
  to: string;
};

function normalizeStatus(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function statusLabel(value?: string | null) {
  switch (normalizeStatus(value)) {
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
      return value || "Not specified";
  }
}

function statusStyle(value?: string | null) {
  switch (normalizeStatus(value)) {
    case "confirmed":
      return "border-green-500/20 bg-green-500/10 text-green-300";
    case "pending":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
    case "cancelled":
    case "canceled":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    case "no_show":
    case "noshow":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "completed":
      return "border-teal-400/20 bg-teal-500/10 text-teal-300";
    default:
      return "border-[#40515D]/40 bg-[#35434D]/20 text-[#C2CDD5]";
  }
}

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "0";
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numberValue);
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

function isDateInRange(dateValue: string | null | undefined, range: DateRange) {
  if (!dateValue) return false;

  const date = dateValue.slice(0, 10);

  if (range.from && date < range.from) {
    return false;
  }

  if (range.to && date > range.to) {
    return false;
  }

  return true;
}

export default function ReportsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [dateRange, setDateRange] = useState<DateRange>({
    from: "",
    to: "",
  });

  const [dateMode, setDateMode] = useState<"check_in" | "created_at">(
    "check_in"
  );

  const loadReservations = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const data = await apiGet<Reservation[]>("/reservations");

      if (!Array.isArray(data)) {
        throw new Error("Invalid reservations response from the backend.");
      }

      setReservations(data);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "An error occurred while loading report data."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReservations();

    const interval = window.setInterval(() => {
      void loadReservations(true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadReservations]);

  const filteredReservations = useMemo(() => {
    return reservations.filter((reservation) => {
      const dateValue =
        dateMode === "check_in"
          ? reservation.check_in
          : reservation.created_at;

      return isDateInRange(dateValue, dateRange);
    });
  }, [reservations, dateRange, dateMode]);

  const report = useMemo(() => {
    const total = filteredReservations.length;

    let confirmed = 0;
    let pending = 0;
    let cancelled = 0;
    let noShow = 0;
    let completed = 0;

    let revenueUsd = 0;
    let revenueEgp = 0;

    let guests = 0;
    let roomCountEstimate = 0;

    const byHotel = new Map<
      string,
      {
        name: string;
        bookings: number;
        revenueUsd: number;
      }
    >();

    const byPayment = new Map<
      string,
      {
        bookings: number;
        revenueUsd: number;
      }
    >();

    for (const reservation of filteredReservations) {
      const status = normalizeStatus(reservation.status);

      if (status === "confirmed") confirmed += 1;
      else if (status === "pending") pending += 1;
      else if (status === "cancelled" || status === "canceled") {
        cancelled += 1;
      } else if (status === "no_show" || status === "noshow") {
        noShow += 1;
      } else if (status === "completed") {
        completed += 1;
      }

      const usd = Number(reservation.total_price_usd || 0);
      const egp = Number(reservation.total_price_egp || 0);

      revenueUsd += Number.isNaN(usd) ? 0 : usd;
      revenueEgp += Number.isNaN(egp) ? 0 : egp;

      guests += Number(reservation.total_guest || 0);

      const hotelName = reservation.hotel?.name || "Not specified";
      const currentHotel = byHotel.get(hotelName) || {
        name: hotelName,
        bookings: 0,
        revenueUsd: 0,
      };

      currentHotel.bookings += 1;
      currentHotel.revenueUsd += Number.isNaN(usd) ? 0 : usd;
      byHotel.set(hotelName, currentHotel);

      const paymentName =
        reservation.payment_label ||
        reservation.payment_type ||
        "Not specified";

      const currentPayment = byPayment.get(paymentName) || {
        bookings: 0,
        revenueUsd: 0,
      };

      currentPayment.bookings += 1;
      currentPayment.revenueUsd += Number.isNaN(usd) ? 0 : usd;
      byPayment.set(paymentName, currentPayment);
    }

    const hotelRows = Array.from(byHotel.values()).sort(
      (a, b) => b.revenueUsd - a.revenueUsd
    );

    const paymentRows = Array.from(byPayment.entries())
      .map(([name, data]) => ({
        name,
        ...data,
      }))
      .sort((a, b) => b.revenueUsd - a.revenueUsd);

    return {
      total,
      confirmed,
      pending,
      cancelled,
      noShow,
      completed,
      revenueUsd,
      revenueEgp,
      guests,
      roomCountEstimate,
      hotelRows,
      paymentRows,
    };
  }, [filteredReservations]);

  const topReservations = useMemo(() => {
    return [...filteredReservations]
      .sort((a, b) => {
        const aTime = a.created_at
          ? new Date(a.created_at).getTime()
          : 0;
        const bTime = b.created_at
          ? new Date(b.created_at).getTime()
          : 0;

        return bTime - aTime;
      })
      .slice(0, 10);
  }, [filteredReservations]);

  function setToday() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    setDateRange({
      from: today,
      to: today,
    });
  }

  function clearDates() {
    setDateRange({
      from: "",
      to: "",
    });
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
                📈 Reports
              </h2>

              <p className="mt-1 text-sm text-[#9AA8B3]">
                Reservation, revenue, and statistics reports
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadReservations(true)}
              disabled={loading || refreshing}
              className="w-fit rounded-xl border border-[#394B58] bg-[#141C23] px-4 py-3 text-sm font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? "Refreshing..." : "🔄 Refresh"}
            </button>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <section className="mb-6 rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-lg font-bold">
                  📅 Report Period
                </h3>

                <p className="mt-1 text-sm text-[#9AA8B3]">
                  Select the period you want to analyze.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={setToday}
                  className="rounded-lg border border-[#394B58] px-4 py-2 text-xs text-[#D7E0E6] transition hover:bg-[#1B2730]"
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={clearDates}
                  className="rounded-lg border border-[#394B58] px-4 py-2 text-xs text-[#D7E0E6] transition hover:bg-[#1B2730]"
                >
                  All periods
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm text-[#9AA8B3]">
                  Report based on
                </label>

                <select
                  value={dateMode}
                  onChange={(event) =>
                    setDateMode(
                      event.target.value as
                        | "check_in"
                        | "created_at"
                    )
                  }
                  className="w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none focus:border-teal-400"
                >
                  <option value="check_in">
                    Check-in date
                  </option>

                  <option value="created_at">
                    Reservation creation date
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="report-from"
                  className="mb-2 block text-sm text-[#9AA8B3]"
                >
                  From
                </label>

                <input
                  id="report-from"
                  type="date"
                  value={dateRange.from}
                  onChange={(event) =>
                    setDateRange((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none focus:border-teal-400"
                />
              </div>

              <div>
                <label
                  htmlFor="report-to"
                  className="mb-2 block text-sm text-[#9AA8B3]"
                >
                  To
                </label>

                <input
                  id="report-to"
                  type="date"
                  value={dateRange.to}
                  onChange={(event) =>
                    setDateRange((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none focus:border-teal-400"
                />
              </div>
            </div>
          </section>

          <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label="Total Reservations"
              value={loading ? "..." : String(report.total)}
              icon="📅"
            />

            <StatCard
              label="Confirmed"
              value={loading ? "..." : String(report.confirmed)}
              icon="✅"
              tone="green"
            />

            <StatCard
              label="No Show"
              value={loading ? "..." : String(report.noShow)}
              icon="🚫"
              tone="red"
            />

            <StatCard
              label="Cancelled"
              value={loading ? "..." : String(report.cancelled)}
              icon="❌"
              tone="yellow"
            />

            <StatCard
              label="Revenue USD"
              value={
                loading
                  ? "..."
                  : `USD ${formatMoney(report.revenueUsd)}`
              }
              icon="💰"
              tone="blue"
            />
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">
                    🏨 Reservations by Hotel
                  </h3>

                  <p className="mt-1 text-xs text-[#9AA8B3]">
                    Hotels ranked by reservation value in USD
                  </p>
                </div>
              </div>

              {report.hotelRows.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#9AA8B3]">
                  No data for the selected period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="border-b border-[#2A3843] text-[#9AA8B3]">
                      <tr>
                        <th className="px-4 py-3 text-right">
                          Hotel
                        </th>

                        <th className="px-4 py-3 text-right">
                          Reservations
                        </th>

                        <th className="px-4 py-3 text-right">
                          Revenue
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {report.hotelRows.map((hotel) => (
                        <tr
                          key={hotel.name}
                          className="border-b border-[#26333D]"
                        >
                          <td className="px-4 py-3 font-semibold">
                            {hotel.name}
                          </td>

                          <td className="px-4 py-3 text-[#C2CDD5]">
                            {hotel.bookings}
                          </td>

                          <td className="px-4 py-3 font-semibold text-green-300">
                            USD {formatMoney(hotel.revenueUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
              <div className="mb-5">
                <h3 className="text-lg font-bold">
                  💳 Reservations by Payment Method
                </h3>

                <p className="mt-1 text-xs text-[#9AA8B3]">
                  Total reservations and value by recorded payment method
                </p>
              </div>

              {report.paymentRows.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#9AA8B3]">
                  No data for the selected period.
                </div>
              ) : (
                <div className="space-y-3">
                  {report.paymentRows.map((payment) => (
                    <div
                      key={payment.name}
                      className="flex items-center justify-between rounded-xl border border-[#26333D] bg-[#0B1116] p-4"
                    >
                      <div>
                        <p className="font-semibold">
                          {payment.name}
                        </p>

                        <p className="mt-1 text-xs text-[#73828D]">
                          {payment.bookings} reservation
                        </p>
                      </div>

                      <p className="font-semibold text-green-300">
                        USD {formatMoney(payment.revenueUsd)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat
              label="Revenue L.E"
              value={`EGP ${formatMoney(report.revenueEgp)}`}
            />

            <MiniStat
              label="Pending"
              value={String(report.pending)}
            />

            <MiniStat
              label="Completed"
              value={String(report.completed)}
            />

            <MiniStat
              label="Total Guests"
              value={String(report.guests)}
            />
          </section>

          <section className="rounded-2xl border border-[#2A3843] bg-[#141C23]">
            <div className="flex flex-col gap-2 border-b border-[#2A3843] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">
                  🕐 Latest Reservations in Report
                </h3>

                <p className="mt-1 text-xs text-[#9AA8B3]">
                  Latest 10 reservations in the selected period
                </p>
              </div>

              <Link
                href="/reservations"
                className="text-sm text-teal-400 hover:text-teal-300"
              >
                View All Reservations
              </Link>
            </div>

            {topReservations.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#9AA8B3]">
                No reservations in the selected period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="border-b border-[#2A3843] bg-[#1B2730]/45">
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
                        Check-in
                      </th>

                      <th className="px-5 py-4 text-right">
                        Price
                      </th>

                      <th className="px-5 py-4 text-right">
                        Status
                      </th>

                      <th className="px-5 py-4 text-center">
                        Details
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {topReservations.map((reservation) => (
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

                        <td className="px-5 py-4 font-semibold text-green-300">
                          USD{" "}
                          {formatMoney(
                            reservation.total_price_usd
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle(
                              reservation.status
                            )}`}
                          >
                            {statusLabel(reservation.status)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <Link
                            href={`/reservations/${encodeURIComponent(
                              reservation.booking_number
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
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  icon: string;
  tone?: "slate" | "green" | "red" | "yellow" | "blue";
}) {
  const toneClasses = {
    slate: "border-[#2A3843]",
    green: "border-green-500/20",
    red: "border-red-500/20",
    yellow: "border-yellow-500/20",
    blue: "border-teal-400/20",
  };

  return (
    <div
      className={`rounded-2xl border bg-[#141C23] p-5 ${toneClasses[tone]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[#9AA8B3]">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold">
            {value}
          </p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1B2730]/70 text-xl">
          {icon}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
      <p className="text-sm text-[#9AA8B3]">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold">
        {value}
      </p>
    </div>
  );
}
