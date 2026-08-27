"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";

type Hotel = {
  id: number;
  name: string;
};

type Reservation = {
  id: number;
  booking_number: string;
  hotel?: Hotel | null;
  guest_name?: string | null;
  payment_type?: string | null;
  payment_label?: string | null;
  total_price_usd?: number | string | null;
  total_price_egp?: number | string | null;
  status?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  created_at?: string | null;
};

function normalizePaymentType(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function getPaymentChannel(value?: string | null) {
  const paymentType = normalizePaymentType(value);

  if (paymentType.startsWith("booking")) {
    return "Booking.com";
  }

  if (paymentType.startsWith("expedia")) {
    return "Expedia";
  }

  if (paymentType.startsWith("trip")) {
    return "Trip.com";
  }

  if (paymentType.startsWith("agoda")) {
    return "Agoda";
  }

  return value || "Not specified";
}

function isCash(value?: string | null) {
  return normalizePaymentType(value).endsWith("_cash");
}

function getPaymentState(value?: string | null) {
  const paymentType = normalizePaymentType(value);

  if (paymentType.endsWith("_cash")) {
    return "Cash";
  }

  if (paymentType.endsWith("_paid")) {
    return "Paid";
  }

  return "Not specified";
}

function getPaymentStateStyle(value?: string | null) {
  const state = getPaymentState(value);

  if (state === "Cash") {
    return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
  }

  if (state === "Paid") {
    return "border-green-500/20 bg-green-500/10 text-green-300";
  }

  return "border-[#40515D]/40 bg-[#35434D]/20 text-[#C2CDD5]";
}

function getReservationStatus(value?: string | null) {
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

function getReservationStatusStyle(value?: string | null) {
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

export default function PaymentsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadReservations = useCallback(
    async (showRefreshing = false) => {
      try {
        if (showRefreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const data = await apiGet<Reservation[]>(
          "/reservations"
        );

        if (!Array.isArray(data)) {
          throw new Error(
            "Invalid reservations response from the backend."
          );
        }

        setReservations(data);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Could not load payment data."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadReservations();

    const interval = window.setInterval(() => {
      void loadReservations(true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadReservations]);

  const filteredReservations = useMemo(() => {
    const value = search.trim().toLowerCase();

    return reservations.filter((reservation) => {
      const paymentType = normalizePaymentType(
        reservation.payment_type
      );

      const matchesSearch =
        !value ||
        reservation.booking_number
          ?.toLowerCase()
          .includes(value) ||
        reservation.guest_name
          ?.toLowerCase()
          .includes(value) ||
        reservation.hotel?.name
          ?.toLowerCase()
          .includes(value);

      const matchesChannel =
        channelFilter === "all" ||
        getPaymentChannel(paymentType) === channelFilter;

      const matchesState =
        stateFilter === "all" ||
        getPaymentState(paymentType) === stateFilter;

      return (
        matchesSearch &&
        matchesChannel &&
        matchesState
      );
    });
  }, [
    reservations,
    search,
    channelFilter,
    stateFilter,
  ]);

  const stats = useMemo(() => {
    let totalUsd = 0;
    let cashUsd = 0;
    let paidUsd = 0;

    for (const reservation of reservations) {
      const amount = Number(
        reservation.total_price_usd || 0
      );

      totalUsd += amount;

      if (isCash(reservation.payment_type)) {
        cashUsd += amount;
      } else if (
        normalizePaymentType(
          reservation.payment_type
        ).endsWith("_paid")
      ) {
        paidUsd += amount;
      }
    }

    return {
      totalTransactions: reservations.length,
      totalUsd,
      cashUsd,
      paidUsd,
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
                💳 Payments
              </h2>

              <p className="mt-1 text-sm text-[#9AA8B3]">
                Track payments by reservations and sales channels
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadReservations(true)}
              disabled={loading || refreshing}
              className="w-fit rounded-xl border border-[#394B58] bg-[#141C23] px-4 py-3 text-sm font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing
                ? "Refreshing..."
                : "🔄 Refresh"}
            </button>
          </div>

          <div className="mb-6 rounded-xl border border-teal-400/20 bg-teal-500/5 px-4 py-3 text-sm text-teal-200">
            <strong>Note:</strong> The current system does not have an independent
            Payments log in the database. This page
            calculates payments from current reservation information
            (`payment_type` and `total_price_usd/egp`).
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <p className="text-sm text-[#9AA8B3]">
                Total Transactions
              </p>

              <p className="mt-2 text-3xl font-bold">
                {loading ? "..." : stats.totalTransactions}
              </p>
            </div>

            <div className="rounded-2xl border border-teal-400/20 bg-[#141C23] p-5">
              <p className="text-sm text-teal-300">
                Total Value
              </p>

              <p className="mt-2 text-2xl font-bold text-teal-300">
                {loading
                  ? "..."
                  : `USD ${formatMoney(stats.totalUsd)}`}
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-500/20 bg-[#141C23] p-5">
              <p className="text-sm text-yellow-300">
                Cash
              </p>

              <p className="mt-2 text-2xl font-bold text-yellow-300">
                {loading
                  ? "..."
                  : `USD ${formatMoney(stats.cashUsd)}`}
              </p>
            </div>

            <div className="rounded-2xl border border-green-500/20 bg-[#141C23] p-5">
              <p className="text-sm text-green-300">
                Paid
              </p>

              <p className="mt-2 text-2xl font-bold text-green-300">
                {loading
                  ? "..."
                  : `USD ${formatMoney(stats.paidUsd)}`}
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <label
                htmlFor="payment-search"
                className="text-sm text-[#9AA8B3]"
              >
                Search
              </label>

              <input
                id="payment-search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Booking Number, Guest Name, or Hotel..."
                className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition placeholder:text-[#586874] focus:border-teal-400"
              />
            </div>

            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <label
                htmlFor="channel-filter"
                className="text-sm text-[#9AA8B3]"
              >
                Sales Channel
              </label>

              <select
                id="channel-filter"
                value={channelFilter}
                onChange={(event) =>
                  setChannelFilter(event.target.value)
                }
                className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none focus:border-teal-400"
              >
                <option value="all">
                  All Channels
                </option>
                <option value="Booking.com">
                  Booking.com
                </option>
                <option value="Expedia">
                  Expedia
                </option>
                <option value="Trip.com">
                  Trip.com
                </option>
                <option value="Agoda">
                  Agoda
                </option>
              </select>
            </div>

            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
              <label
                htmlFor="payment-state-filter"
                className="text-sm text-[#9AA8B3]"
              >
                Payment Status
              </label>

              <select
                id="payment-state-filter"
                value={stateFilter}
                onChange={(event) =>
                  setStateFilter(event.target.value)
                }
                className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none focus:border-teal-400"
              >
                <option value="all">
                  All Statuses
                </option>
                <option value="Paid">
                  Paid
                </option>
                <option value="Cash">
                  Cash
                </option>
              </select>
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-[#2A3843] bg-[#141C23] px-5 py-4">
            <span className="text-sm text-[#9AA8B3]">
              Current Results:
            </span>{" "}
            <strong>
              {loading
                ? "Loading..."
                : `${filteredReservations.length} From ${reservations.length}`}
            </strong>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-12 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#30404C] border-t-blue-500" />
              <p className="text-sm text-[#9AA8B3]">
                Loading payment data...
              </p>
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-12 text-center">
              <div className="text-5xl">💳</div>

              <p className="mt-4 text-lg font-semibold">
                No results
              </p>

              <p className="mt-2 text-sm text-[#9AA8B3]">
                Try changing the search or filters.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#2A3843] bg-[#141C23]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
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
                        Channel
                      </th>

                      <th className="px-5 py-4 text-right">
                        Payment Status
                      </th>

                      <th className="px-5 py-4 text-right">
                        Amount USD
                      </th>

                      <th className="px-5 py-4 text-right">
                        Amount EGP
                      </th>

                      <th className="px-5 py-4 text-right">
                        Reservation Status
                      </th>

                      <th className="px-5 py-4 text-right">
                        Check-in
                      </th>

                      <th className="px-5 py-4 text-center">
                        Details
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredReservations.map(
                      (reservation) => (
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
                            {getPaymentChannel(
                              reservation.payment_type
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getPaymentStateStyle(
                                reservation.payment_type
                              )}`}
                            >
                              {getPaymentState(
                                reservation.payment_type
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4 font-semibold text-green-300">
                            USD{" "}
                            {formatMoney(
                              reservation.total_price_usd
                            )}
                          </td>

                          <td className="px-5 py-4 text-[#C2CDD5]">
                            {reservation.total_price_egp !==
                            null &&
                            reservation.total_price_egp !==
                              undefined
                              ? `EGP ${formatMoney(
                                  reservation.total_price_egp
                                )}`
                              : "-"}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getReservationStatusStyle(
                                reservation.status
                              )}`}
                            >
                              {getReservationStatus(
                                reservation.status
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-[#C2CDD5]">
                            {formatDate(
                              reservation.check_in
                            )}
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
