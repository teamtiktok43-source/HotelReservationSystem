"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "../../lib/api";

type Room = {
  id: number;
  room_type_id: number | null;
  room_type?: string | null;
  rate_plan_id: number | null;
  rate_plan_code?: string | null;
  rate_plan_name?: string | null;
  meals?: string | null;
  nights?: number | null;
  total_price_usd?: number | string | null;
  nightly_rate_usd?: number | string | null;
  total_price_egp?: number | string | null;
  nightly_rate_egp?: number | string | null;
  exchange_rate?: number | string | null;
};

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
  rooms?: Room[];
  room_count?: number | null;
  total_price_usd?: number | string | null;
  total_price_egp?: number | string | null;
  guest_requests: string | null;
  status: string | null;
  created_by?: string | null;
  hotel_confirmation_number?: string | null;
  email_status?: string | null;
  email_sent_at?: string | null;
  email_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Message = {
  type: "success" | "error";
  text: string;
};

function normalizeStatus(status?: string | null) {
  return (status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getStatusText(status?: string | null) {
  switch (normalizeStatus(status)) {
    case "confirmed":
      return "مؤكد";
    case "pending":
      return "قيد الانتظار";
    case "cancelled":
    case "canceled":
      return "ملغي";
    case "completed":
      return "مكتمل";
    case "no_show":
    case "noshow":
      return "No Show";
    default:
      return status || "غير محدد";
  }
}

function getStatusStyle(status?: string | null) {
  switch (normalizeStatus(status)) {
    case "confirmed":
      return "bg-green-500/10 text-green-300 border-green-500/20";
    case "pending":
      return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
    case "cancelled":
    case "canceled":
      return "bg-red-500/10 text-red-300 border-red-500/20";
    case "no_show":
    case "noshow":
      return "bg-red-500/10 text-red-200 border-red-500/30";
    case "completed":
      return "bg-teal-500/10 text-teal-300 border-teal-400/20";
    default:
      return "bg-[#35434D]/20 text-[#C2CDD5] border-[#40515D]/40";
  }
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

  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatGuestComposition(reservation: Reservation) {
  if (reservation.guest_count_label) {
    return reservation.guest_count_label;
  }

  const adults = reservation.adult_count ?? reservation.total_guest ?? 0;
  const children = reservation.child_count ?? 0;

  const parts: string[] = [];
  if (adults) {
    parts.push(`${adults} Adult${adults === 1 ? "" : "s"}`);
  }
  if (children) {
    parts.push(`${children} Child${children === 1 ? "" : "ren"}`);
  }
  return parts.join(" + ") || "0";
}

export default function ReservationDetailsPage() {
  const params = useParams();
  const rawBookingNumber = params?.booking_number;
  const bookingNumber = Array.isArray(rawBookingNumber)
    ? rawBookingNumber[0]
    : String(rawBookingNumber || "");

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");

  const loadReservation = useCallback(async () => {
    if (!bookingNumber) {
      setError("رقم الحجز غير موجود.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_BASE_URL}/reservation/${encodeURIComponent(
          bookingNumber
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : `تعذر تحميل الحجز (${response.status})`
        );
      }

      setReservation(data);
      setConfirmationInput(data?.hotel_confirmation_number || "");
    } catch (fetchError) {
      setReservation(null);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "حدث خطأ أثناء تحميل الحجز."
      );
    } finally {
      setLoading(false);
    }
  }, [bookingNumber]);

  useEffect(() => {
    void loadReservation();
  }, [loadReservation]);

  async function updateStatus(
    status: "confirmed" | "cancelled" | "no_show" | "completed" | "pending"
  ) {
    if (!reservation) return;

    try {
      setWorking(true);
      setMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/reservation/${encodeURIComponent(
          reservation.booking_number
        )}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : `فشل تحديث حالة الحجز (${response.status})`
        );
      }

      setMessage({
        type: "success",
        text: "تم تحديث حالة الحجز بنجاح.",
      });

      await loadReservation();
    } catch (updateError) {
      setMessage({
        type: "error",
        text:
          updateError instanceof Error
            ? updateError.message
            : "حدث خطأ أثناء تحديث حالة الحجز.",
      });
    } finally {
      setWorking(false);
    }
  }

  async function sendEmail() {
    if (!reservation) return;

    if (!reservation.hotel?.email) {
      setMessage({
        type: "error",
        text: "الفندق لا يحتوي على بريد إلكتروني مسجل.",
      });
      return;
    }

    try {
      setWorking(true);
      setMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/reservation/${encodeURIComponent(
          reservation.booking_number
        )}/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sent_by: reservation.created_by || "Reservations Department",
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : `فشل إرسال البريد (${response.status})`
        );
      }

      setMessage({
        type: "success",
        text: `تم إرسال الحجز إلى ${data?.email || reservation.hotel.email} بنجاح.`,
      });

      await loadReservation();
    } catch (sendError) {
      setMessage({
        type: "error",
        text:
          sendError instanceof Error
            ? sendError.message
            : "حدث خطأ أثناء إرسال البريد.",
      });
    } finally {
      setWorking(false);
    }
  }

  async function saveHotelConfirmation() {
    if (!reservation) return;

    try {
      setWorking(true);
      setMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/reservation/${encodeURIComponent(
          reservation.booking_number
        )}/hotel-confirmation`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmation_number:
              confirmationInput.trim() || null,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : `فشل حفظ رقم تأكيد الفندق (${response.status})`
        );
      }

      setMessage({
        type: "success",
        text: "تم حفظ رقم تأكيد الفندق.",
      });

      await loadReservation();
    } catch (confirmationError) {
      setMessage({
        type: "error",
        text:
          confirmationError instanceof Error
            ? confirmationError.message
            : "حدث خطأ أثناء حفظ رقم التأكيد.",
      });
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B1116] text-[#F3F7F9]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#30404C] border-t-blue-500" />
          <p className="text-[#9AA8B3]">
            جاري تحميل بيانات الحجز...
          </p>
        </div>
      </main>
    );
  }

  if (error || !reservation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B1116] px-4 text-[#F3F7F9]">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/20 bg-[#141C23] p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-2xl">
            ⚠️
          </div>

          <h1 className="mb-2 text-xl font-bold">
            تعذر تحميل الحجز
          </h1>

          <p className="mb-6 text-sm text-red-300">
            {error || "الحجز غير موجود."}
          </p>

          <Link
            href="/reservations"
            className="inline-flex rounded-xl bg-teal-600 px-6 py-3 font-semibold text-[#F3F7F9] transition hover:bg-teal-500"
          >
            العودة إلى الحجوزات
          </Link>
        </div>
      </main>
    );
  }

  const rooms = reservation.rooms || [];

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#0B1116] text-[#F3F7F9]"
    >
      {/* Header */}
      <header className="border-b border-[#26333D] bg-[#10181F]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              تفاصيل الحجز
            </h1>

            <p className="mt-1 text-sm text-[#9AA8B3]">
              عرض وإدارة جميع بيانات الحجز
            </p>
          </div>

          <Link
            href="/reservations"
            className="rounded-xl border border-[#30404C] bg-[#1B2730] px-5 py-2.5 text-sm font-medium transition hover:bg-[#273640]"
          >
            ← العودة للحجوزات
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {/* Messages */}
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

        {/* Booking Header */}
        <div className="mb-6 rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 text-sm text-[#9AA8B3]">
                رقم الحجز
              </p>

              <h2 className="text-3xl font-bold text-teal-400">
                {reservation.booking_number}
              </h2>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span
                className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${getStatusStyle(
                  reservation.status
                )}`}
              >
                {getStatusText(reservation.status)}
              </span>

              {reservation.created_at && (
                <span className="text-xs text-[#73828D]">
                  تم الإنشاء:{" "}
                  {formatDateTime(reservation.created_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Hotel + Guest */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
            <h3 className="mb-6 border-b border-[#26333D] pb-4 text-lg font-bold">
              🏨 بيانات الفندق
            </h3>

            <div className="space-y-5">
              <InfoRow
                label="اسم الفندق"
                value={reservation.hotel?.name || "-"}
              />

              <InfoRow
                label="البريد الإلكتروني"
                value={reservation.hotel?.email || "-"}
              />

              <InfoRow
                label="رقم الهاتف"
                value={reservation.hotel?.phone || "-"}
              />

              <InfoRow
                label="العنوان"
                value={reservation.hotel?.address || "-"}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
            <h3 className="mb-6 border-b border-[#26333D] pb-4 text-lg font-bold">
              👤 بيانات النزيل
            </h3>

            <div className="space-y-5">
              <InfoRow
                label="اسم النزيل"
                value={reservation.guest_name || "-"}
              />

              <InfoRow
                label="عدد النزلاء"
                value={
                  reservation.total_guest !== null &&
                  reservation.total_guest !== undefined
                    ? String(reservation.total_guest)
                    : "-"
                }
              />

              <InfoRow
                label="الجنسية"
                value={reservation.nationality || "-"}
              />

              <InfoRow
                label="أنشأه"
                value={reservation.created_by || "-"}
              />
            </div>
          </div>
        </div>

        {/* Stay */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
            <h3 className="mb-6 border-b border-[#26333D] pb-4 text-lg font-bold">
              📅 بيانات الإقامة
            </h3>

            <div className="grid gap-5 sm:grid-cols-2">
              <InfoRow
                label="Check-in"
                value={formatDate(reservation.check_in)}
              />

              <InfoRow
                label="Check-out"
                value={formatDate(reservation.check_out)}
              />

              <InfoRow
                label="عدد الليالي"
                value={
                  reservation.nights !== null &&
                  reservation.nights !== undefined
                    ? String(reservation.nights)
                    : "-"
                }
              />

              <InfoRow
                label="عدد الغرف"
                value={
                  reservation.room_count !== null &&
                  reservation.room_count !== undefined
                    ? String(reservation.room_count)
                    : String(rooms.length)
                }
              />

              <InfoRow
                label="طريقة الدفع"
                value={
                  reservation.payment_label ||
                  reservation.payment_type ||
                  "-"
                }
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
            <h3 className="mb-6 border-b border-[#26333D] pb-4 text-lg font-bold">
              💰 الملخص المالي
            </h3>

            <div className="space-y-5">
              <InfoRow
                label="إجمالي USD"
                value={
                  reservation.total_price_usd !== null &&
                  reservation.total_price_usd !== undefined
                    ? `USD ${formatMoney(
                        reservation.total_price_usd
                      )}`
                    : "-"
                }
                highlight
              />

              <InfoRow
                label="إجمالي EGP"
                value={
                  reservation.total_price_egp !== null &&
                  reservation.total_price_egp !== undefined
                    ? `EGP ${formatMoney(
                        reservation.total_price_egp
                      )}`
                    : "-"
                }
              />
            </div>
          </div>
        </div>

        {/* Rooms */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-[#26333D] bg-[#141C23]">
          <div className="border-b border-[#26333D] p-6">
            <h3 className="text-lg font-bold">
              🛏️ الغرف والأسعار
            </h3>

            <p className="mt-1 text-sm text-[#9AA8B3]">
              تفاصيل كل غرفة وRate Plan والسعر المرتبط بها
            </p>
          </div>

          {rooms.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#9AA8B3]">
              لا توجد بيانات غرف مرتبطة بهذا الحجز.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-[#26333D] bg-[#1B2730]/45">
                  <tr>
                    <th className="px-5 py-4 text-right">
                      الغرفة
                    </th>
                    <th className="px-5 py-4 text-right">
                      نوع الغرفة
                    </th>
                    <th className="px-5 py-4 text-right">
                      Rate Plan
                    </th>
                    <th className="px-5 py-4 text-right">
                      الوجبات
                    </th>
                    <th className="px-5 py-4 text-right">
                      الليالي
                    </th>
                    <th className="px-5 py-4 text-right">
                      السعر USD
                    </th>
                    <th className="px-5 py-4 text-right">
                      السعر EGP
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rooms.map((room, index) => (
                    <tr
                      key={room.id || index}
                      className="border-b border-[#26333D] hover:bg-[#1B2730]/45"
                    >
                      <td className="px-5 py-4 font-semibold text-teal-300">
                        {index + 1}
                      </td>

                      <td className="px-5 py-4 text-[#D7E0E6]">
                        {room.room_type || "-"}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#D7E0E6]">
                          {room.rate_plan_code || "-"}
                        </div>

                        {room.rate_plan_name && (
                          <div className="mt-1 text-xs text-[#73828D]">
                            {room.rate_plan_name}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-[#C2CDD5]">
                        {room.meals || "-"}
                      </td>

                      <td className="px-5 py-4 text-[#C2CDD5]">
                        {room.nights ?? reservation.nights ?? "-"}
                      </td>

                      <td className="px-5 py-4 font-semibold text-green-300">
                        USD{" "}
                        {formatMoney(
                          room.total_price_usd
                        )}
                      </td>

                      <td className="px-5 py-4 text-[#C2CDD5]">
                        {room.total_price_egp !== null &&
                        room.total_price_egp !== undefined
                          ? `EGP ${formatMoney(
                              room.total_price_egp
                            )}`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Requests + Email */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
            <h3 className="mb-6 border-b border-[#26333D] pb-4 text-lg font-bold">
              📝 طلبات النزيل
            </h3>

            <div className="min-h-[140px] rounded-xl border border-[#26333D] bg-[#0B1116] p-4 text-sm leading-7 text-[#C2CDD5]">
              {reservation.guest_requests ||
                "لا توجد طلبات مسجلة"}
            </div>
          </div>

          <div className="rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
            <h3 className="mb-6 border-b border-[#26333D] pb-4 text-lg font-bold">
              📧 حالة البريد
            </h3>

            <div className="space-y-5">
              <InfoRow
                label="بريد الفندق"
                value={
                  reservation.hotel?.email || "غير مسجل"
                }
              />

              <InfoRow
                label="حالة الإرسال"
                value={
                  reservation.email_status || "غير محدد"
                }
              />

              <InfoRow
                label="وقت الإرسال"
                value={formatDateTime(
                  reservation.email_sent_at
                )}
              />

              {reservation.email_error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                  {reservation.email_error}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hotel Confirmation */}
        <div className="mb-6 rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
          <h3 className="mb-6 border-b border-[#26333D] pb-4 text-lg font-bold">
            🔖 رقم تأكيد الفندق
          </h3>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={confirmationInput}
              onChange={(event) =>
                setConfirmationInput(
                  event.target.value
                )
              }
              placeholder="أدخل رقم تأكيد الفندق"
              className="flex-1 rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition focus:border-teal-400"
              disabled={working}
            />

            <button
              type="button"
              onClick={saveHotelConfirmation}
              disabled={working}
              className="rounded-xl bg-teal-600 px-6 py-3 font-semibold transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working
                ? "جاري الحفظ..."
                : "💾 حفظ رقم التأكيد"}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-2xl border border-[#26333D] bg-[#141C23] p-6">
          <h3 className="mb-5 text-lg font-bold">
            ⚡ إجراءات الحجز
          </h3>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                updateStatus("confirmed")
              }
              disabled={working}
              className="rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-3 font-semibold text-green-300 transition hover:bg-green-500/20 disabled:opacity-50"
            >
              ✅ تأكيد الحجز
            </button>

            <button
              type="button"
              onClick={() =>
                updateStatus("no_show")
              }
              disabled={working}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              🚫 No Show
            </button>

            <button
              type="button"
              onClick={() =>
                updateStatus("cancelled")
              }
              disabled={working}
              className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-5 py-3 font-semibold text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-50"
            >
              ❌ إلغاء الحجز
            </button>

            <button
              type="button"
              onClick={sendEmail}
              disabled={
                working || !reservation.hotel?.email
              }
              className="rounded-xl bg-teal-600 px-5 py-3 font-semibold transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              📧 إرسال الحجز للفندق
            </button>

            <Link
              href="/reservations"
              className="rounded-xl border border-[#30404C] bg-[#1B2730] px-5 py-3 font-semibold text-[#F3F7F9] transition hover:bg-[#273640]"
            >
              ← العودة للحجوزات
            </Link>
          </div>

          <p className="mt-4 text-xs text-[#73828D]">
            زر إرسال الحجز يستخدم حساب Gmail المتصل من الإعدادات
            ويرسل إلى بريد الفندق المسجل في بيانات الفندق.
          </p>
        </div>
      </section>
    </main>
  );
}

function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-5">
      <span className="text-sm text-[#9AA8B3]">
        {label}
      </span>

      <span
        className={`max-w-[65%] text-left text-sm font-semibold break-words ${
          highlight
            ? "text-emerald-400"
            : "text-[#E7EEF3]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}