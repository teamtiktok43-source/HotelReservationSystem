"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, apiDelete, apiGet, apiPost } from "../lib/api";

type Room = {
  id: number;
  room_type?: string | null;
  rate_plan_code?: string | null;
  rate_plan_name?: string | null;
  meals?: string | null;
  nights?: number | null;
  nightly_rate_usd?: number | string | null;
  total_price_usd?: number | string | null;
  total_price_egp?: number | string | null;
};

type Hotel = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type Reservation = {
  booking_number: string;
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
  reservation_type?: string | null;
  rooms?: Room[];
  room_count?: number | null;
  total_price_usd?: number | string | null;
  total_price_egp?: number | string | null;
  status?: string | null;
  guest_requests?: string | null;
  payment_receipt_path?: string | null;
  payment_receipt_last4?: string | null;
  payment_receipt_url?: string | null;
};

function money(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "-";

  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return "-";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numberValue);
}

function dateValue(value?: string | null) {
  if (!value) return "-";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function displayBackendText(value?: string | null) {
  if (!value) return "-";

  const normalized = value.trim().toLowerCase();

  const translations: Record<string, string> = {
    "كاش": "Cash",
    "نقدي": "Cash",
    "نقداً": "Cash",
    "كاش فقط": "Cash",
    "بطاقة": "Card",
    "بطاقه": "Card",
    "فيزا": "Visa",
    "ماستر كارد": "Mastercard",
    "مدفوع": "Paid",
    "غير مدفوع": "Unpaid",
    "دفع عند الوصول": "Pay at Hotel",
    "دفع عند الفندق": "Pay at Hotel",
    "حجز": "Reservation",
    "مؤكد": "Confirmed",
    "قيد الانتظار": "Pending",
    "ملغي": "Cancelled",
    "مكتمل": "Completed",
    "غير محدد": "Not specified",
  };

  return translations[normalized] || value;
}

function channelText(reservation?: Reservation | null) {
  return displayBackendText(
    reservation?.payment_label ||
      reservation?.payment_type ||
      reservation?.reservation_type ||
      "-"
  );
}

function statusText(status?: string | null) {
  const value = (status || "").trim().toLowerCase();

  if (value === "confirmed") return "Confirmed";
  if (value === "pending") return "Pending";
  if (value === "cancelled" || value === "canceled") return "Cancelled";
  if (value === "no_show" || value === "noshow") return "No Show";
  if (value === "completed") return "Completed";

  return status || "Not specified";
}

function receiptUrl(path?: string | null) {
  if (!path) return null;

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return path.startsWith("/")
    ? `${API_BASE_URL}${path}`
    : `${API_BASE_URL}/${path}`;
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

export default function InvoicePrintPage() {
  const [bookingNumber, setBookingNumber] = useState("");
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [copies, setCopies] = useState(1);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileName, setReceiptFileName] = useState("");
  const [last4Digits, setLast4Digits] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [deletingReceipt, setDeletingReceipt] = useState(false);
  const [printing, setPrinting] = useState<"preview" | "print" | null>(null);

  const rooms = reservation?.rooms || [];

  const totalRooms = useMemo(
    () => reservation?.room_count ?? rooms.length,
    [reservation, rooms.length]
  );
  const pricePerDayText =
    rooms.length === 0
      ? "-"
      : rooms
          .map(
            (room) =>
              `$${money(room.nightly_rate_usd)}`
          )
          .join(" • ");

  function handleReceiptUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setReceiptMessage("Please select an image in JPG, PNG, or WEBP format.");
      return;
    }

    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {
      setReceiptMessage("Receipt image size must not exceed 10MB.");
      return;
    }

    setReceiptFile(file);

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        setReceiptMessage("Unable to read the receipt image.");
        return;
      }

      setReceiptPreview(result);
      setReceiptFileName(file.name);
      setReceiptMessage("Receipt image loaded for preview.");
    };

    reader.onerror = () => {
      setReceiptMessage("An error occurred while reading the receipt image.");
    };

    reader.readAsDataURL(file);
  }

  function removeReceiptPreview() {
    setReceiptPreview(null);
    setReceiptFile(null);
    setReceiptFileName("");
  }

  async function saveReceiptToBackend() {
    if (!reservation) return;

    if (!receiptFile) {
      setReceiptMessage("Please select a receipt image first.");
      return;
    }

    if (!/^\d{4}$/.test(last4Digits)) {
      setReceiptMessage("Enter the last 4 digits of the transaction.");
      return;
    }

    try {
      setSavingReceipt(true);
      setReceiptMessage("");

      const formData = new FormData();
      formData.append("receipt", receiptFile);
      formData.append("last4", last4Digits);

      const data = await apiPost<{
        payment_receipt_url?: string | null;
        payment_receipt_path?: string | null;
        payment_receipt_last4?: string | null;
      }>(
        `/reservation/${encodeURIComponent(
          reservation.booking_number
        )}/payment-receipt`,
        formData,
        { isFormData: true }
      );

      const savedUrl = receiptUrl(data?.payment_receipt_url);

      setReservation((current) =>
        current
          ? {
              ...current,
              payment_receipt_path:
                data?.payment_receipt_path ??
                current.payment_receipt_path ??
                null,
              payment_receipt_last4:
                data?.payment_receipt_last4 ?? last4Digits,
              payment_receipt_url: savedUrl,
            }
          : current
      );

      setReceiptPreview(savedUrl || receiptPreview);
      setReceiptFile(null);
      setReceiptFileName(data?.payment_receipt_path || receiptFileName);
      setReceiptMessage("✅ Receipt saved and linked to the reservation successfully.");
    } catch (saveError) {
      setReceiptMessage(
        saveError instanceof Error
          ? saveError.message
          : "An error occurred while saving the receipt."
      );
    } finally {
      setSavingReceipt(false);
    }
  }

  async function deleteReceiptFromBackend() {
    if (!reservation?.payment_receipt_path) {
      removeReceiptPreview();
      setLast4Digits("");
      setReceiptMessage("");
      return;
    }

    try {
      setDeletingReceipt(true);
      setReceiptMessage("");

      await apiDelete<{
        success?: boolean;
        message?: string;
      }>(
        `/reservation/${encodeURIComponent(
          reservation.booking_number
        )}/payment-receipt`
      );

      setReservation((current) =>
        current
          ? {
              ...current,
              payment_receipt_path: null,
              payment_receipt_last4: null,
              payment_receipt_url: null,
            }
          : current
      );

      setReceiptPreview(null);
      setReceiptFile(null);
      setReceiptFileName("");
      setLast4Digits("");
      setReceiptMessage("✅ Payment receipt deleted from the reservation.");
    } catch (deleteError) {
      setReceiptMessage(
        deleteError instanceof Error
          ? deleteError.message
          : "An error occurred while deleting the receipt."
      );
    } finally {
      setDeletingReceipt(false);
    }
  }

  useEffect(() => {
    const existingUrl = reservation?.payment_receipt_url
      ? receiptUrl(reservation.payment_receipt_url)
      : reservation?.payment_receipt_path
      ? receiptUrl(
          `/uploads/payment-receipts/${reservation.payment_receipt_path}`
        )
      : null;

    setReceiptPreview(existingUrl);
    setReceiptFile(null);
    setReceiptFileName(reservation?.payment_receipt_path || "");
    setLast4Digits(reservation?.payment_receipt_last4 || "");
    setReceiptMessage("");
  }, [
    reservation?.booking_number,
    reservation?.payment_receipt_path,
    reservation?.payment_receipt_last4,
    reservation?.payment_receipt_url,
  ]);

  async function recordPrintToBackend() {
    if (!reservation) {
      return;
    }

    await apiPost<{
      success?: boolean;
      message?: string;
    }>(
      `/reservation/${encodeURIComponent(
        reservation.booking_number
      )}/print`,
      {
        printed_by: "Mostafa Amer",
      }
    );
  }

  async function handlePrint(mode: "preview" | "print") {
    setPrinting(mode);

    try {
      // Give React a moment to update the button state, then open the
      // browser print dialog.
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 50);
      });

      window.print();

      // Only the real print action is logged.
      if (mode === "print") {
        await recordPrintToBackend();
      }
    } catch (printError) {
      console.error(printError);
    } finally {
      window.setTimeout(() => {
        setPrinting(null);
      }, 500);
    }
  }

  async function loadReservationByNumber(value: string) {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      setReservation(null);
      setError("Enter the reservation number first.");
      return;
    }

    try {
      setSearching(true);
      setError("");
      setReservation(null);

      const data = await apiGet<Reservation>(
        `/reservation/${encodeURIComponent(
          normalizedValue
        )}`
      );

      setBookingNumber(normalizedValue);
      setReservation(data);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "An error occurred while searching for the reservation."
      );
    } finally {
      setSearching(false);
    }
  }

  async function searchReservation(event?: FormEvent) {
    event?.preventDefault();
    await loadReservationByNumber(bookingNumber);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlBookingNumber = params.get("booking")?.trim();

    if (!urlBookingNumber) {
      return;
    }

    setBookingNumber(urlBookingNumber);
    void loadReservationByNumber(urlBookingNumber);
  }, []);

  return (
    <main dir="ltr" className="min-h-screen bg-[#0A1015] text-[#F3F7F9]">
      <header className="no-print fixed inset-x-0 top-0 z-50 h-16 border-b border-[#26333D]/80 bg-[#0b1426]/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-[#C2CDD5] transition hover:bg-[#1B2730] hover:text-[#F3F7F9]"
            >
              ←
            </Link>

            <div>
              <h1 className="font-bold">Hotel Reservation System</h1>
              <p className="text-xs text-[#73828D]">
                Invoice Printing
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
        <div className="mx-auto max-w-[1500px] px-5 pb-12">
          <div className="no-print mb-6">
            <h2 className="text-3xl font-black">
              🧾 Print Reservation Invoice
            </h2>

            <p className="mt-2 text-sm text-[#9AA8B3]">
              The reservation sheet is formatted for printing, with a large
              area reserved for the payment receipt.
            </p>
          </div>

          <section className="no-print mb-6 rounded-2xl border border-[#30404C]/70 bg-[#0d182b] p-4">
            <form
              onSubmit={searchReservation}
              className="flex flex-col gap-3 md:flex-row md:items-end"
            >
              <div className="flex-1">
                <label
                  htmlFor="booking-number"
                  className="mb-2 block text-sm font-semibold text-[#C2CDD5]"
                >
                  Reservation Number
                </label>

                <input
                  id="booking-number"
                  value={bookingNumber}
                  onChange={(event) =>
                    setBookingNumber(event.target.value)
                  }
                  placeholder="Example: 202624"
                  autoComplete="off"
                  className="w-full rounded-xl border border-[#394B58] bg-[#0A1015] px-4 py-3 text-lg font-semibold text-[#F3F7F9] outline-none transition focus:border-teal-400"
                />
              </div>

              <button
                type="submit"
                disabled={searching}
                className="rounded-xl bg-teal-600 px-7 py-3 font-bold transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searching ? "Searching..." : "🔎 Search"}
              </button>
            </form>

            {error && (
              <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                ❌ {error}
              </div>
            )}
          </section>

          {!reservation ? (
            <div className="no-print rounded-3xl border border-dashed border-[#30404C] bg-[#0d182b] px-6 py-24 text-center">
              <div className="text-6xl">🧾</div>

              <h3 className="mt-5 text-2xl font-bold">
                Start by searching for a reservation
              </h3>

              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#9AA8B3]">
                Enter the Reservation Number to display the reservation sheet with all its details.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
              {/* Control Panel */}
              <aside className="no-print order-1">
                <div className="sticky top-24 space-y-4">
                  <section className="rounded-3xl border border-[#30404C]/70 bg-[#0d182b] p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-black">
                          Invoice Settings
                        </h3>

                        <p className="mt-1 text-xs text-[#73828D]">
                          Quick controls before printing
                        </p>
                      </div>

                      <span className="rounded-lg bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-200">
                        {totalRooms} room(s)
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-[#30404C] bg-[#0A1015] p-4">
                        <div className="text-xs text-[#73828D]">
                          Reservation Number
                        </div>

                        <div className="mt-1 text-xl font-black text-teal-300">
                          {reservation.booking_number}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#30404C] bg-[#0A1015] p-4">
                        <div className="text-xs text-[#73828D]">
                          Hotel
                        </div>

                        <div className="mt-1 font-bold">
                          {reservation.hotel?.name || "-"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#30404C] bg-[#0A1015] p-4">
                        <div className="text-xs text-[#73828D]">
                          Copies
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setCopies((value) =>
                                Math.max(1, value - 1)
                              )
                            }
                            className="h-10 w-10 rounded-lg border border-[#394B58] hover:bg-[#1B2730]"
                          >
                            −
                          </button>

                          <div className="flex-1 rounded-lg border border-[#394B58] px-3 py-2 text-center font-black">
                            {copies}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setCopies((value) =>
                                Math.min(9, value + 1)
                              )
                            }
                            className="h-10 w-10 rounded-lg border border-[#394B58] hover:bg-[#1B2730]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-amber-500/20 bg-[#0d182b] p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-black">
                          🧾 Payment Receipt
                        </h3>

                        <p className="mt-1 text-xs text-[#73828D]">
                          Upload the receipt and enter the last 4 digits
                        </p>
                      </div>

                      <span className="rounded-lg bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                        Receipt
                      </span>
                    </div>

                    <label
                      htmlFor="receipt-upload"
                      className="mt-4 flex min-h-[270px] cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-[#30404C] bg-[#0A1015] p-4 text-center transition hover:border-teal-400/60 hover:bg-[#0a1528]"
                    >
                      {receiptPreview ? (
                        <div className="w-full">
                          <img
                            src={receiptPreview}
                            alt="Payment receipt preview"
                            className="mx-auto max-h-[300px] w-full rounded-xl object-contain bg-white"
                          />

                          <p className="mt-3 truncate text-xs text-[#9AA8B3]">
                            {receiptFileName}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <div className="text-5xl">📷</div>

                          <p className="mt-4 font-bold">
                            + Add Receipt Image
                          </p>

                          <p className="mt-2 text-xs leading-6 text-[#73828D]">
                            JPG / PNG / WEBP — up to 10MB
                          </p>
                        </div>
                      )}

                      <input
                        id="receipt-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleReceiptUpload}
                      />
                    </label>

                    <div className="mt-4">
                      <label
                        htmlFor="receipt-last4"
                        className="mb-2 block text-sm font-semibold text-[#C2CDD5]"
                      >
                        Last 4 Digits of Transaction
                      </label>

                      <div className="flex items-center gap-2">
                        <input
                          id="receipt-last4"
                          inputMode="numeric"
                          maxLength={4}
                          value={last4Digits}
                          onChange={(event) => {
                            const digits = event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 4);

                            setLast4Digits(digits);
                            setReceiptMessage("");
                          }}
                          placeholder="0692"
                          className="flex-1 rounded-xl border border-[#394B58] bg-[#0A1015] px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-teal-400"
                        />

                        <span className="rounded-xl border border-[#30404C] bg-[#0A1015] px-3 py-3 text-xs text-[#73828D]">
                          ****
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          document
                            .getElementById("receipt-upload")
                            ?.click()
                        }
                        className="rounded-xl border border-[#394B58] px-3 py-3 text-sm font-semibold hover:bg-[#1B2730]"
                      >
                        {receiptPreview ? "🔄 Change" : "+ Add"}
                      </button>

                      <button
                        type="button"
                        onClick={deleteReceiptFromBackend}
                        disabled={
                          deletingReceipt ||
                          (!receiptPreview &&
                            !reservation.payment_receipt_path)
                        }
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-sm font-semibold text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deletingReceipt
                          ? "Deleting..."
                          : "🗑️ Delete"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={saveReceiptToBackend}
                      disabled={savingReceipt || !receiptFile}
                      className="mt-2 w-full rounded-xl bg-teal-600 px-4 py-3 font-bold transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingReceipt
                        ? "Saving receipt..."
                        : "💾 Save Receipt to Reservation"}
                    </button>

                    {receiptMessage && (
                      <div className="mt-3 rounded-xl border border-[#30404C] bg-[#0A1015] px-3 py-2 text-xs text-[#C2CDD5]">
                        {receiptMessage}
                      </div>
                    )}

                    {reservation.payment_receipt_path &&
                      !savingReceipt && (
                        <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                          ✅ Receipt is saved with the reservation
                        </div>
                      )}
                  </section>

                  <section className="rounded-3xl border border-[#30404C]/70 bg-[#0d182b] p-5">
                    <h3 className="font-black">⚡ Actions</h3>

                    <p className="mt-1 text-xs leading-5 text-[#73828D]">
                      Preview and printing use the custom A4 invoice settings.
                    </p>

                    <div className="mt-4 grid gap-2">
                      <button
                        type="button"
                        onClick={() => handlePrint("preview")}
                        disabled={printing !== null}
                        className="rounded-xl bg-violet-600 px-4 py-3 font-bold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {printing === "preview"
                          ? "Opening preview..."
                          : "👁️ Print Preview"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePrint("print")}
                        disabled={printing !== null}
                        className="rounded-xl bg-emerald-600 px-4 py-3 font-bold transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {printing === "print"
                          ? "Opening print dialog..."
                          : "🖨️ Invoice Printing"}
                      </button>

                      <Link
                        href={`/reservations/${encodeURIComponent(
                          reservation.booking_number
                        )}`}
                        className="rounded-xl border border-[#394B58] px-4 py-3 text-center font-semibold text-[#D7E0E6] hover:bg-[#1B2730]"
                      >
                        Reservation Details
                      </Link>
                    </div>
                  </section>
                </div>
              </aside>

              {/* ===================================================== */}
              {/* Printable Reservation - A4 / Original PDF Structure */}
              {/* ===================================================== */}
              <div className="order-2 flex justify-center">
                <article className="invoice-sheet">
                  {/* Header */}
                  <header className="reservation-header">
                    <div className="hotel-name">
                      {reservation.hotel?.name || "HOTEL RESERVATION"}
                    </div>

                    <div className="reservation-strip">
                      <div className="hotel-mark">
                        <span className="hotel-diamond">◆</span>
                        <span>{reservation.hotel?.name || "HOTEL"}</span>
                      </div>

                      <div className="reservation-pill">
                        RESERVATION
                      </div>

                      <div className="hotel-mark">
                        <span className="hotel-diamond">◆</span>
                        <span>{reservation.hotel?.name || "HOTEL"}</span>
                      </div>
                    </div>
                  </header>

                  {/* Main document body */}
                  <div className="reservation-body">
                    {/* Left / reservation information */}
                    <section className="reservation-info">
                      <InfoTableRow
                        label="Reservation Number"
                        value={reservation.booking_number}
                        valueStrong
                      />

                      <InfoTableRow
                        label="Guest Name"
                        value={reservation.guest_name || "-"}
                        valueStrong
                      />

                      <InfoTableRow
                        label="Guest Composition"
                        value={formatGuestComposition(reservation)}
                      />

                      <InfoTableRow
                        label="Nationality"
                        value={reservation.nationality || "-"}
                      />

                      <InfoTableRow
                        label="Total (Room / Suite)"
                        value={String(totalRooms)}
                      />

                      <InfoTableRow
                        label="Total guests"
                        value={formatGuestComposition(reservation)}
                      />

                      <RoomStackRow
                        label="Type (Room / Suite)"
                        rooms={rooms}
                      />

                      <div className="info-row info-row-date">
                        <div className="info-label date-label">
                          Date
                        </div>

                        <div className="date-values">
                          <div className="date-line">
                            <span>Check In</span>
                            <strong>
                              {dateValue(reservation.check_in)}
                            </strong>
                          </div>

                          <div className="date-line">
                            <span>Check Out</span>
                            <strong>
                              {dateValue(reservation.check_out)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <InfoTableRow
                        label="Total Nights"
                        value={String(reservation.nights ?? "-")}
                      />

                      <RoomPriceStackRow
                        label="Price / Day / (Room/suite)"
                        rooms={rooms}
                      />

                      <div className="info-row total-price-row">
                        <div className="info-label">
                          Total price
                        </div>

                        <div className="info-value price-value">
                          ${money(reservation.total_price_usd)}

                          {reservation.total_price_egp !== null &&
                            reservation.total_price_egp !== undefined && (
                              <span className="secondary-price">
                                L.E {money(reservation.total_price_egp)}
                              </span>
                            )}
                        </div>
                      </div>

                      <InfoTableRow
                        label="Card Number"
                        value={`************${
                          last4Digits ||
                          reservation.payment_receipt_last4 ||
                          "----"
                        }`}
                        valueStrong
                      />
                    </section>

                    {/* Right / receipt - vertically aligned with the data */}
                    <section className="receipt-column">
                      <div className="receipt-title">
                        PAYMENT RECEIPT
                      </div>

                      <div className="receipt-image-frame">
                        {receiptPreview ? (
                          <img
                            src={receiptPreview}
                            alt="Payment receipt"
                            className="receipt-image"
                          />
                        ) : (
                          <div className="receipt-empty">
                            <div className="receipt-empty-icon">
                              🧾
                            </div>
                            <div>PAYMENT RECEIPT</div>
                            <small>
                              Payment receipt area
                            </small>
                          </div>
                        )}

                        <div className="receipt-watermark">
                          ****
                          {last4Digits ||
                            reservation.payment_receipt_last4 ||
                            "----"}
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Spacer matching the original document */}
                  <div className="document-spacer" />

                  {/* Booking source / footer */}
                  <footer className="reservation-footer">
                    <div className="booking-source">
                      {channelText(reservation)}
                    </div>

                    <div className="footer-meta">
                      <span>
                        {reservation.hotel?.phone || ""}
                      </span>

                      <span>
                        {reservation.hotel?.address || ""}
                      </span>

                      <span>
                        Copies: {copies}
                      </span>
                    </div>
                  </footer>
                </article>
              </div>
            </div>
          )}
        </div>
      </section>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        html,
        body {
          background: #162033;
        }

        .invoice-sheet {
          width: 190mm;
          height: 277mm;
          margin: 10mm auto;
          overflow: hidden;
          background: #ffffff;
          color: #141C23;
          border: 1.5mm solid #141C23;
          border-radius: 2.5mm;
          box-shadow:
            0 0 0 0.6px rgba(17, 24, 39, 0.12),
            0 14px 35px rgba(0, 0, 0, 0.18);
          font-family: Arial, Helvetica, sans-serif;
        }

        .reservation-header {
          height: 31mm;
          border-bottom: 2px solid #141C23;
          background: #fff;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .hotel-name {
          height: 16mm;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 6mm;
          font-size: 6.2mm;
          font-weight: 900;
          letter-spacing: 0.02em;
          text-align: center;
          direction: rtl;
        }

        .reservation-strip {
          height: 13mm;
          display: grid;
          grid-template-columns: 1fr 72mm 1fr;
          align-items: center;
          justify-items: center;
          gap: 5mm;
          padding: 0 6mm;
          border-top: 2px solid #141C23;
          direction: ltr;
        }

        .hotel-mark {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.8mm;
          min-width: 0;
          font-size: 2.2mm;
          font-weight: 900;
          line-height: 1;
          text-align: center;
          direction: rtl;
        }

        .hotel-diamond {
          color: #c6922a;
          font-size: 4mm;
          line-height: 1;
        }

        .reservation-pill {
          height: 9mm;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.4mm solid #141C23;
          border-radius: 999px;
          background: #ffffff;
          font-size: 4.1mm;
          font-weight: 900;
          letter-spacing: 0.03em;
        }

        .reservation-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 56mm;
          min-height: 190mm;
          direction: ltr;
        }

        .reservation-info {
          min-width: 0;
          margin: 3mm;
          border: 1.8px solid #141C23;
          border-radius: 3mm;
          overflow: hidden;
          background: #ffffff;
          direction: rtl;
        }

        .receipt-column {
          min-width: 0;
          margin: 3mm 3mm 3mm 0;
          border: 2px solid #141C23;
          border-radius: 3mm;
          background: #fff;
          display: flex;
          flex-direction: column;
          direction: rtl;
          overflow: hidden;
        }

        .receipt-title {
          height: 9mm;
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 2px solid #141C23;
          background: #f8f8f8;
          font-size: 3.2mm;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-align: center;
        }

        .receipt-image-frame {
          position: relative;
          flex: 1;
          margin: 3mm;
          border: 1.8px solid #141C23;
          border-radius: 3mm;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .receipt-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 3mm;
        }

        .receipt-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2mm;
          color: #64748b;
          text-align: center;
          font-size: 3mm;
          font-weight: 900;
        }

        .receipt-empty small {
          font-size: 2.4mm;
          font-weight: 500;
        }

        .receipt-empty-icon {
          font-size: 9mm;
        }

        .receipt-watermark {
          position: absolute;
          right: 4mm;
          bottom: 3mm;
          min-width: 26mm;
          padding: 1.2mm 2mm;
          border: 1px solid #141C23;
          border-radius: 999px;
          background: #ffffff;
          text-align: right;
          font-size: 2.5mm;
          font-weight: 900;
          color: #141C23;
          direction: ltr;
        }

        .info-row {
          min-height: 11.7mm;
          display: grid;
          grid-template-columns: 42% 58%;
          border-bottom: 1.5px solid #141C23;
          direction: ltr;
        }

        .info-label,
        .info-value {
          display: flex;
          align-items: center;
          padding: 2.5mm 4mm;
        }

        .info-label {
          justify-content: center;
          text-align: center;
          border-right: 1.5px solid #141C23;
          background: #f7f7f7;
          font-size: 3.15mm;
          font-weight: 900;
          line-height: 1.15;
          direction: ltr;
        }

        .info-value {
          min-width: 0;
          justify-content: center;
          text-align: center;
          background: #fff;
          font-size: 3.5mm;
          font-weight: 800;
          line-height: 1.2;
          direction: rtl;
        }

        .info-value-strong {
          font-weight: 900;
        }

        .total-price-row .info-value,
        .info-row:last-child .info-value {
          justify-content: center;
          text-align: center;
          direction: ltr;
        }

        .info-row-wrap {
          min-height: 18mm;
        }

        .info-value-wrap {
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .room-stack-row {
          min-height: 18mm;
          display: grid;
          grid-template-columns: 42% 58%;
          border-bottom: 1.5px solid #141C23;
          direction: ltr;
        }

        .room-stack-row .info-label {
          display: flex;
          align-items: center;
          justify-content: center;
          border-right: 1.5px solid #141C23;
          background: #f7f7f7;
          padding: 2.5mm 4mm;
          text-align: center;
          font-size: 3.1mm;
          font-weight: 900;
          line-height: 1.15;
        }

        .room-stack-values {
          display: flex;
          flex-direction: column;
          min-width: 0;
          direction: rtl;
        }

        .room-stack-item {
          min-height: 13mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 0.7mm;
          padding: 1.8mm 3mm;
          text-align: center;
          font-size: 3.2mm;
          font-weight: 900;
          line-height: 1.2;
        }

        .room-stack-item + .room-stack-item {
          border-top: 1.5px solid #141C23;
        }

        .room-stack-item-main {
          font-weight: 900;
          overflow-wrap: anywhere;
        }

        .room-stack-item-meta {
          font-size: 2.65mm;
          font-weight: 800;
          color: #475569;
          overflow-wrap: anywhere;
        }

        .room-stack-price {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 13mm;
          padding: 1.8mm 3mm;
          text-align: center;
          font-size: 3.35mm;
          font-weight: 900;
          direction: ltr;
        }

        .room-stack-price + .room-stack-price {
          border-top: 1.5px solid #141C23;
        }

        .info-row-date {
          min-height: 18.5mm;
          grid-template-columns: 42% 58%;
          direction: ltr;
        }

        .date-label {
          justify-content: center !important;
          text-align: center !important;
          border-right: 1.5px solid #141C23;
          background: #f7f7f7;
          direction: ltr;
        }

        .date-values {
          display: flex;
          flex-direction: column;
          direction: rtl;
        }

        .date-line {
          flex: 1;
          display: grid;
          grid-template-columns: 32% 68%;
          align-items: center;
          border-bottom: 1.5px solid #141C23;
          direction: ltr;
        }

        .date-line:last-child {
          border-bottom: 0;
        }

        .date-line span {
          border-right: 1.5px solid #141C23;
          min-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2mm 3mm;
          text-align: center;
          font-size: 2.8mm;
          font-weight: 900;
          direction: ltr;
        }

        .date-line strong {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2mm 3mm;
          text-align: center;
          font-size: 3.4mm;
          font-weight: 900;
          direction: ltr;
        }

        .total-price-row {
          min-height: 17mm;
        }

        .price-value {
          flex-direction: column;
          gap: 0.8mm;
          font-size: 4.3mm;
          font-weight: 900;
        }

        .secondary-price {
          color: #7c5a18;
          font-size: 2.8mm;
          font-weight: 800;
        }

        .document-spacer {
          height: 11mm;
          border-bottom: 2px solid #141C23;
          background: #fff;
        }

        .reservation-footer {
          height: 28mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 5mm;
          background: #fff;
          text-align: center;
        }

        .booking-source {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 7mm;
          font-style: italic;
          font-weight: 900;
          color: #141C23;
        }

        .footer-meta {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          padding: 0 6mm;
          font-size: 2.2mm;
          color: #475569;
        }

        .footer-meta span:nth-child(1) {
          text-align: right;
        }

        .footer-meta span:nth-child(2) {
          text-align: center;
        }

        .footer-meta span:nth-child(3) {
          text-align: left;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          html,
          body,
          main,
          section,
          section > div {
            background: #ffffff !important;
            color: #141C23 !important;
          }

          html,
          body {
            width: auto !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          main {
            min-height: 0 !important;
          }

          section {
            padding: 0 !important;
          }

          section > div {
            max-width: none !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .invoice-sheet {
            box-sizing: border-box !important;
            width: 190mm !important;
            height: 277mm !important;
            min-height: 277mm !important;
            max-height: 277mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
            color: #141C23 !important;
            border: 1.5mm solid #141C23 !important;
            border-radius: 3mm !important;
            box-shadow: none !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-after: avoid !important;
            break-inside: avoid !important;
          }

          .invoice-sheet,
          .invoice-sheet * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-page-meta,
          .print-url,
          .print-date,
          .print-hide-meta,
          .footer-meta {
            display: none !important;
          }

          .reservation-body {
            grid-template-columns: minmax(0, 1fr) 56mm !important;
            min-height: 181mm !important;
            max-height: 181mm !important;
            direction: ltr !important;
          }

          .reservation-info {
            margin: 2mm !important;
            border-width: 1.5px !important;
            border-radius: 2mm !important;
          }

          .receipt-column {
            margin: 2mm 2mm 2mm 0 !important;
            border-width: 1.5px !important;
            border-radius: 2mm !important;
          }

          .receipt-image-frame {
            margin: 2mm !important;
            border-width: 1.5px !important;
            border-radius: 2mm !important;
          }

          .reservation-info,
          .reservation-info .info-row,
          .reservation-info .info-label,
          .reservation-info .info-value,
          .reservation-info .date-values,
          .reservation-info .date-line,
          .reservation-info .date-line span,
          .reservation-info .date-line strong,
          .receipt-column,
          .receipt-title,
          .receipt-image-frame {
            border-color: #141C23 !important;
          }

          .reservation-info .info-row,
          .reservation-info .date-line {
            border-bottom: 1.2px solid #141C23 !important;
          }

          .reservation-info .info-label,
          .reservation-info .date-line span {
            border-right: 1.2px solid #141C23 !important;
          }

          .room-stack-row {
            min-height: auto !important;
          }

          .room-stack-item,
          .room-stack-price {
            min-height: 10mm !important;
            padding: 1.2mm 2mm !important;
            font-size: 3mm !important;
          }

          .room-stack-item-meta {
            font-size: 2.4mm !important;
          }

          .receipt-image {
            padding: 3mm !important;
          }
        }
      `}</style>
    </main>
  );
}




function RoomStackRow({
  label,
  rooms,
}: {
  label: string;
  rooms: Room[];
}) {
  return (
    <div className="room-stack-row">
      <div className="info-label">{label}</div>

      <div className="room-stack-values">
        {rooms.length === 0 ? (
          <div className="room-stack-item">
            <div className="room-stack-item-main">-</div>
          </div>
        ) : (
          rooms.map((room, index) => {
            const roomType = room.room_type || "-";
            const ratePlan = displayBackendText(
              room.rate_plan_code || room.rate_plan_name || "-"
            );
            const meals = displayBackendText(room.meals || "-");

            return (
              <div
                key={room.id || index}
                className="room-stack-item"
              >
                <div className="room-stack-item-main">
                  {roomType}
                </div>

                <div className="room-stack-item-meta">
                  {ratePlan} • {meals}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RoomPriceStackRow({
  label,
  rooms,
}: {
  label: string;
  rooms: Room[];
}) {
  return (
    <div className="room-stack-row">
      <div className="info-label">{label}</div>

      <div className="room-stack-values">
        {rooms.length === 0 ? (
          <div className="room-stack-price">-</div>
        ) : (
          rooms.map((room, index) => (
            <div
              key={room.id || index}
              className="room-stack-price"
            >
              ${money(room.nightly_rate_usd)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InfoTableRow({
  label,
  value,
  valueStrong = false,
  wrap = false,
}: {
  label: string;
  value: string;
  valueStrong?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className={`info-row ${wrap ? "info-row-wrap" : ""}`}>
      <div className="info-label">{label}</div>

      <div
        className={`info-value ${
          valueStrong ? "info-value-strong" : ""
        } ${wrap ? "info-value-wrap" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function ElegantField({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-4">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#73828D]">
        {label}
      </div>

      <div
        className={`mt-1 leading-5 ${
          emphasize
            ? "text-[15px] font-black text-slate-950"
            : "text-[13px] font-bold text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ReceiptField({
  label,
  value,
  strong = false,
  tall = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tall?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[190px_minmax(0,1fr)] border-b-2 border-black ${
        tall ? "min-h-[82px]" : ""
      }`}
    >
      <div className="border-l-2 border-black px-4 py-4 text-center font-black">
        {label}
      </div>

      <div
        className={`flex items-center justify-center px-4 py-4 text-center ${
          strong ? "text-lg font-black" : "font-semibold"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
