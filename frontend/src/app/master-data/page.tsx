"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  apiGet,
  apiPatch,
  apiPost,
  getCurrentUser,
  type CurrentUser,
} from "../lib/api";

type Tab = "nationalities" | "room-types" | "guest-counts" | "rate-plans" | "booking-payment-types";

type Message = {
  type: "success" | "error";
  text: string;
};

type Nationality = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  created_at?: string | null;
};

type RoomType = {
  id: number;
  name: string;
  code?: string | null;
  is_active: boolean;
  created_at?: string | null;
};

type GuestCountOption = {
  id: number;
  adults: number;
  children: number;
  code: string;
  label: string;
  is_active: boolean;
  created_at?: string | null;
};

type RatePlan = {
  id: number;
  code: string;
  name: string;
  meals?: string | null;
  is_active: boolean;
  created_at?: string | null;
};

type BookingPaymentType = {
  id: number;
  code: string;
  source: string;
  payment_method: string;
  label: string;
  is_active: boolean;
  is_cash?: boolean;
  created_at?: string | null;
};

const TABS: Array<{
  key: Tab;
  label: string;
  description: string;
}> = [
  {
    key: "nationalities",
    label: "Nationalities",
    description: "248-country nationality master list",
  },
  {
    key: "room-types",
    label: "Room Types",
    description: "Room names and short codes",
  },
  {
    key: "guest-counts",
    label: "Guest Counts",
    description: "Adults / children combinations",
  },
  {
    key: "rate-plans",
    label: "Rate Plans",
    description: "Fixed RO / B.B / H.B / F.B plans",
  },
  {
    key: "booking-payment-types",
    label: "Booking / Payment Types",
    description: "Booking sources and payment status options",
  },
];

function normalizeRole(role?: string | null) {
  const value = (role || "").trim().toLowerCase();

  if (value === "it" || value === "i.t" || value === "technical") {
    return "IT";
  }

  if (
    value === "manager" ||
    value === "administrator" ||
    value === "admin" ||
    value === "مدير"
  ) {
    return "Manager";
  }

  return "Reservation Employee";
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

function getErrorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<Tab>("nationalities");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [search, setSearch] = useState("");

  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [guestCounts, setGuestCounts] = useState<GuestCountOption[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [bookingPaymentTypes, setBookingPaymentTypes] = useState<BookingPaymentType[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [nationalityForm, setNationalityForm] = useState({
    code: "",
    name: "",
  });

  const [roomTypeForm, setRoomTypeForm] = useState({
    name: "",
    code: "",
  });

  const [guestCountForm, setGuestCountForm] = useState({
    adults: "1",
    children: "0",
    code: "",
    label: "",
  });

  const [bookingPaymentTypeForm, setBookingPaymentTypeForm] = useState({
    code: "",
    source: "",
    payment_method: "Paid",
    label: "",
  });

  const isAdmin =
    normalizeRole(currentUser?.role) === "Manager" ||
    normalizeRole(currentUser?.role) === "IT";

  const loadCurrentUser = useCallback(async () => {
    try {
      const response = await getCurrentUser();
      setCurrentUser(response.user);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  const loadMasterData = useCallback(async () => {
    try {
      setLoading(true);
      setMessage(null);

      const [
        nationalityData,
        roomTypeData,
        guestCountData,
        ratePlanData,
        bookingPaymentTypeData,
      ] = await Promise.all([
        apiGet<Nationality[]>("/nationalities"),
        apiGet<RoomType[]>("/room-types"),
        apiGet<GuestCountOption[]>("/guest-count-options"),
        apiGet<RatePlan[]>("/rate-plans"),
        apiGet<BookingPaymentType[]>("/booking-payment-types"),
      ]);

      setNationalities(Array.isArray(nationalityData) ? nationalityData : []);
      setRoomTypes(Array.isArray(roomTypeData) ? roomTypeData : []);
      setGuestCounts(Array.isArray(guestCountData) ? guestCountData : []);
      setRatePlans(Array.isArray(ratePlanData) ? ratePlanData : []);
      setBookingPaymentTypes(
        Array.isArray(bookingPaymentTypeData) ? bookingPaymentTypeData : []
      );
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "An error occurred while loading master data."
        ),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();
    void loadMasterData();
  }, [loadCurrentUser, loadMasterData]);

  useEffect(() => {
    setSearch("");
    setEditingId(null);
    setMessage(null);
  }, [activeTab]);

  const filteredNationalities = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return nationalities;
    }

    return nationalities.filter(
      (item) =>
        item.code.toLowerCase().includes(value) ||
        item.name.toLowerCase().includes(value)
    );
  }, [nationalities, search]);

  const filteredRoomTypes = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return roomTypes;
    }

    return roomTypes.filter(
      (item) =>
        item.name.toLowerCase().includes(value) ||
        (item.code || "").toLowerCase().includes(value)
    );
  }, [roomTypes, search]);

  const filteredGuestCounts = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return guestCounts;
    }

    return guestCounts.filter(
      (item) =>
        item.code.toLowerCase().includes(value) ||
        item.label.toLowerCase().includes(value) ||
        String(item.adults).includes(value) ||
        String(item.children).includes(value)
    );
  }, [guestCounts, search]);

  const filteredBookingPaymentTypes = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return bookingPaymentTypes;
    }

    return bookingPaymentTypes.filter(
      (item) =>
        item.code.toLowerCase().includes(value) ||
        item.source.toLowerCase().includes(value) ||
        item.payment_method.toLowerCase().includes(value) ||
        item.label.toLowerCase().includes(value)
    );
  }, [bookingPaymentTypes, search]);

  function resetForms() {
    setEditingId(null);
    setNationalityForm({ code: "", name: "" });
    setRoomTypeForm({ name: "", code: "" });
    setGuestCountForm({
      adults: "1",
      children: "0",
      code: "",
      label: "",
    });
    setBookingPaymentTypeForm({
      code: "",
      source: "",
      payment_method: "Paid",
      label: "",
    });
  }

  function startNationalityEdit(item: Nationality) {
    setEditingId(item.id);
    setNationalityForm({
      code: item.code,
      name: item.name,
    });
    setMessage(null);
  }

  function startRoomTypeEdit(item: RoomType) {
    setEditingId(item.id);
    setRoomTypeForm({
      name: item.name,
      code: item.code || "",
    });
    setMessage(null);
  }

  function startGuestCountEdit(item: GuestCountOption) {
    setEditingId(item.id);
    setGuestCountForm({
      adults: String(item.adults),
      children: String(item.children),
      code: item.code,
      label: item.label,
    });
    setMessage(null);
  }

  async function handleNationalitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdmin) {
      setMessage({
        type: "error",
        text: "Only Manager and IT users can change master data.",
      });
      return;
    }

    const code = nationalityForm.code.trim().toUpperCase();
    const name = nationalityForm.name.trim();

    if (!code || !name) {
      setMessage({
        type: "error",
        text: "Nationality code and name are required.",
      });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      if (editingId !== null) {
        await apiPatch(`/nationalities/${editingId}`, {
          code,
          name,
        });
        setMessage({
          type: "success",
          text: "Nationality updated successfully.",
        });
      } else {
        await apiPost("/nationalities", {
          code,
          name,
          is_active: true,
        });
        setMessage({
          type: "success",
          text: "Nationality added successfully.",
        });
      }

      resetForms();
      await loadMasterData();
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "Could not save the nationality."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRoomTypeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdmin) {
      setMessage({
        type: "error",
        text: "Only Manager and IT users can change master data.",
      });
      return;
    }

    const name = roomTypeForm.name.trim();
    const code = roomTypeForm.code.trim().toUpperCase();

    if (!name) {
      setMessage({
        type: "error",
        text: "Room type name is required.",
      });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      if (editingId !== null) {
        await apiPatch(`/room-types/${editingId}`, {
          name,
          code: code || null,
        });
        setMessage({
          type: "success",
          text: "Room type updated successfully.",
        });
      } else {
        await apiPost("/room-types", {
          name,
          code: code || null,
          is_active: true,
        });
        setMessage({
          type: "success",
          text: "Room type added successfully.",
        });
      }

      resetForms();
      await loadMasterData();
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "Could not save the room type."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleGuestCountSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!isAdmin) {
      setMessage({
        type: "error",
        text: "Only Manager and IT users can change master data.",
      });
      return;
    }

    const adults = Number(guestCountForm.adults);
    const children = Number(guestCountForm.children);
    const code = guestCountForm.code.trim().toUpperCase();
    const label = guestCountForm.label.trim();

    if (!Number.isInteger(adults) || adults < 1) {
      setMessage({
        type: "error",
        text: "Adults must be at least 1.",
      });
      return;
    }

    if (!Number.isInteger(children) || children < 0) {
      setMessage({
        type: "error",
        text: "Children cannot be negative.",
      });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      if (editingId !== null) {
        await apiPatch(`/guest-count-options/${editingId}`, {
          adults,
          children,
          ...(code ? { code } : {}),
          ...(label ? { label } : {}),
        });
        setMessage({
          type: "success",
          text: "Guest count option updated successfully.",
        });
      } else {
        await apiPost("/guest-count-options", {
          adults,
          children,
          code: code || undefined,
          label: label || undefined,
          is_active: true,
        });
        setMessage({
          type: "success",
          text: "Guest count option added successfully.",
        });
      }

      resetForms();
      await loadMasterData();
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "Could not save the guest count option."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleBookingPaymentTypeSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!isAdmin) {
      setMessage({
        type: "error",
        text: "Only Manager and IT users can change master data.",
      });
      return;
    }

    const code = bookingPaymentTypeForm.code.trim().toLowerCase();
    const source = bookingPaymentTypeForm.source.trim();
    const paymentMethod = bookingPaymentTypeForm.payment_method.trim();
    const label = bookingPaymentTypeForm.label.trim();

    if (!source) {
      setMessage({
        type: "error",
        text: "Booking source is required.",
      });
      return;
    }

    if (!paymentMethod) {
      setMessage({
        type: "error",
        text: "Payment method is required.",
      });
      return;
    }

    if (!label) {
      setMessage({
        type: "error",
        text: "Label is required.",
      });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      if (editingId !== null) {
        await apiPatch(`/booking-payment-types/${editingId}`, {
          source,
          payment_method: paymentMethod,
          label,
        });
        setMessage({
          type: "success",
          text: "Booking / Payment type updated successfully.",
        });
      } else {
        await apiPost("/booking-payment-types", {
          code: code || undefined,
          source,
          payment_method: paymentMethod,
          label,
          is_active: true,
        });
        setMessage({
          type: "success",
          text: "Booking / Payment type added successfully.",
        });
      }

      resetForms();
      await loadMasterData();
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "Could not save the Booking / Payment type."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  function startBookingPaymentTypeEdit(item: BookingPaymentType) {
    setEditingId(item.id);
    setBookingPaymentTypeForm({
      code: item.code,
      source: item.source,
      payment_method: item.payment_method,
      label: item.label,
    });
    setMessage(null);
  }

  async function toggleBookingPaymentType(item: BookingPaymentType) {
    if (!isAdmin) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await apiPatch(`/booking-payment-types/${item.id}`, {
        is_active: !item.is_active,
      });

      setMessage({
        type: "success",
        text: `"${item.label}" is now ${
          item.is_active ? "inactive" : "active"
        }.`,
      });

      await loadMasterData();
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "Could not change Booking / Payment type status."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleNationality(item: Nationality) {
    if (!isAdmin) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await apiPatch(`/nationalities/${item.id}`, {
        is_active: !item.is_active,
      });

      setMessage({
        type: "success",
        text: `"${item.name}" is now ${
          item.is_active ? "inactive" : "active"
        }.`,
      });

      await loadMasterData();
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "Could not change nationality status."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleRoomType(item: RoomType) {
    if (!isAdmin) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await apiPatch(`/room-types/${item.id}`, {
        is_active: !item.is_active,
      });

      setMessage({
        type: "success",
        text: `"${item.name}" is now ${
          item.is_active ? "inactive" : "active"
        }.`,
      });

      await loadMasterData();
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "Could not change room type status."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleGuestCount(item: GuestCountOption) {
    if (!isAdmin) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await apiPatch(`/guest-count-options/${item.id}`, {
        is_active: !item.is_active,
      });

      setMessage({
        type: "success",
        text: `"${item.label}" is now ${
          item.is_active ? "inactive" : "active"
        }.`,
      });

      await loadMasterData();
    } catch (error) {
      setMessage({
        type: "error",
        text: getErrorText(
          error,
          "Could not change guest count status."
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  function renderStatus(active: boolean) {
    return (
      <span
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
          active
            ? "border-green-500/20 bg-green-500/10 text-green-300"
            : "border-red-500/20 bg-red-500/10 text-red-300"
        }`}
      >
        {active ? "Active" : "Inactive"}
      </span>
    );
  }

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0b1220] text-white"
    >
      <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-slate-700/60 bg-[#111827]/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              ←
            </Link>

            <div>
              <h1 className="text-lg font-bold">
                Master Data
              </h1>
              <p className="text-xs text-slate-400">
                Hotel Reservation System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {currentUser && (
              <span className="hidden text-xs text-slate-400 sm:inline">
                {currentUser.full_name || currentUser.username} ·{" "}
                {normalizeRole(currentUser.role)}
              </span>
            )}

            <Link
              href="/dashboard"
              className="text-sm text-blue-400 transition hover:text-blue-300"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <section className="pt-24">
        <div className="mx-auto max-w-7xl p-6">
          <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                System Configuration
              </div>
              <h2 className="text-3xl font-bold">
                Master Data
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Manage the reference data used throughout reservations.
                Nationalities, room types and guest combinations are
                editable by Manager / IT. Rate Plans remain fixed.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadMasterData()}
              disabled={loading || saving}
              className="rounded-xl border border-slate-600 bg-[#111827] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "🔄 Refresh Data"}
            </button>
          </div>

          {!isAdmin && currentUser && (
            <div className="mb-6 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
              Read-only access. Only Manager and IT users can modify
              master data.
            </div>
          )}

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

          <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TABS.map((tab) => {
              const active = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    active
                      ? "border-blue-500/40 bg-blue-500/10 shadow-lg shadow-blue-950/20"
                      : "border-slate-700/60 bg-[#111827] hover:border-slate-600 hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`text-sm font-bold ${
                        active ? "text-blue-300" : "text-white"
                      }`}
                    >
                      {tab.label}
                    </span>

                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-400">
                      {tab.key === "nationalities"
                        ? nationalities.length
                        : tab.key === "room-types"
                        ? roomTypes.length
                        : tab.key === "guest-counts"
                        ? guestCounts.length
                        : tab.key === "rate-plans"
                        ? ratePlans.length
                        : bookingPaymentTypes.length}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    {tab.description}
                  </p>
                </button>
              );
            })}
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-[#111827]">
            <div className="border-b border-slate-700/60 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-lg font-bold">
                    {TABS.find((item) => item.key === activeTab)?.label}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {activeTab === "rate-plans"
                      ? "These four plans are fixed by the business rules."
                      : "Search by the available master-data fields."}
                  </p>
                </div>

                <div className="w-full lg:max-w-md">
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                      activeTab === "nationalities"
                        ? "Search code or nationality..."
                        : activeTab === "room-types"
                        ? "Search room name or code..."
                        : activeTab === "guest-counts"
                        ? "Search adults, children, code or label..."
                        : activeTab === "rate-plans"
                        ? "Search rate plans..."
                        : "Search booking source, method or label..."
                    }
                    className="w-full rounded-xl border border-slate-600 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {activeTab === "nationalities" && (
              <>
                {isAdmin && (
                  <form
                    onSubmit={handleNationalitySubmit}
                    className="border-b border-slate-700/60 bg-[#0b1220] p-5"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">
                          {editingId !== null
                            ? "Edit Nationality"
                            : "Add Nationality"}
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">
                          Use the standard short nationality code.
                        </p>
                      </div>

                      {editingId !== null && (
                        <button
                          type="button"
                          onClick={resetForms}
                          disabled={saving}
                          className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-[180px_1fr_auto]">
                      <input
                        value={nationalityForm.code}
                        onChange={(event) =>
                          setNationalityForm((current) => ({
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="EG"
                        maxLength={20}
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <input
                        value={nationalityForm.name}
                        onChange={(event) =>
                          setNationalityForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Egypt"
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : editingId !== null
                          ? "Save Changes"
                          : "Add Nationality"}
                      </button>
                    </div>
                  </form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/60 text-slate-400">
                        <th className="px-5 py-4 text-left font-medium">
                          Code
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Nationality
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Status
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Created
                        </th>
                        {isAdmin && (
                          <th className="px-5 py-4 text-center font-medium">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {filteredNationalities.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-800/70 hover:bg-slate-800/30"
                        >
                          <td className="px-5 py-4 font-mono font-semibold text-blue-300">
                            {item.code}
                          </td>
                          <td className="px-5 py-4 font-medium text-white">
                            {item.name}
                          </td>
                          <td className="px-5 py-4">
                            {renderStatus(item.is_active)}
                          </td>
                          <td className="px-5 py-4 text-slate-500">
                            {formatDate(item.created_at)}
                          </td>
                          {isAdmin && (
                            <td className="px-5 py-4">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startNationalityEdit(item)}
                                  disabled={saving}
                                  className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleNationality(item)}
                                  disabled={saving}
                                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                    item.is_active
                                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                                      : "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                                  }`}
                                >
                                  {item.is_active ? "Deactivate" : "Activate"}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!loading && filteredNationalities.length === 0 && (
                    <div className="p-12 text-center text-sm text-slate-500">
                      No nationalities match your search.
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === "room-types" && (
              <>
                {isAdmin && (
                  <form
                    onSubmit={handleRoomTypeSubmit}
                    className="border-b border-slate-700/60 bg-[#0b1220] p-5"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">
                          {editingId !== null
                            ? "Edit Room Type"
                            : "Add Room Type"}
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">
                          Room type codes are searchable from reservations.
                        </p>
                      </div>

                      {editingId !== null && (
                        <button
                          type="button"
                          onClick={resetForms}
                          disabled={saving}
                          className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
                      <input
                        value={roomTypeForm.name}
                        onChange={(event) =>
                          setRoomTypeForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Double Room with Sea View"
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <input
                        value={roomTypeForm.code}
                        onChange={(event) =>
                          setRoomTypeForm((current) => ({
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="DO"
                        maxLength={30}
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 font-mono text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : editingId !== null
                          ? "Save Changes"
                          : "Add Room Type"}
                      </button>
                    </div>
                  </form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/60 text-slate-400">
                        <th className="px-5 py-4 text-left font-medium">
                          Room Type
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Code
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Status
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Created
                        </th>
                        {isAdmin && (
                          <th className="px-5 py-4 text-center font-medium">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {filteredRoomTypes.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-800/70 hover:bg-slate-800/30"
                        >
                          <td className="px-5 py-4 font-medium text-white">
                            {item.name}
                          </td>
                          <td className="px-5 py-4 font-mono font-semibold text-blue-300">
                            {item.code || "-"}
                          </td>
                          <td className="px-5 py-4">
                            {renderStatus(item.is_active)}
                          </td>
                          <td className="px-5 py-4 text-slate-500">
                            {formatDate(item.created_at)}
                          </td>
                          {isAdmin && (
                            <td className="px-5 py-4">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startRoomTypeEdit(item)}
                                  disabled={saving}
                                  className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleRoomType(item)}
                                  disabled={saving}
                                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                    item.is_active
                                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                                      : "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                                  }`}
                                >
                                  {item.is_active ? "Deactivate" : "Activate"}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!loading && filteredRoomTypes.length === 0 && (
                    <div className="p-12 text-center text-sm text-slate-500">
                      No room types match your search.
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === "guest-counts" && (
              <>
                {isAdmin && (
                  <form
                    onSubmit={handleGuestCountSubmit}
                    className="border-b border-slate-700/60 bg-[#0b1220] p-5"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">
                          {editingId !== null
                            ? "Edit Guest Count"
                            : "Add Guest Count"}
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">
                          Adults are required; children can be zero.
                        </p>
                      </div>

                      {editingId !== null && (
                        <button
                          type="button"
                          onClick={resetForms}
                          disabled={saving}
                          className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <input
                        type="number"
                        min={1}
                        value={guestCountForm.adults}
                        onChange={(event) =>
                          setGuestCountForm((current) => ({
                            ...current,
                            adults: event.target.value,
                          }))
                        }
                        placeholder="Adults"
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <input
                        type="number"
                        min={0}
                        value={guestCountForm.children}
                        onChange={(event) =>
                          setGuestCountForm((current) => ({
                            ...current,
                            children: event.target.value,
                          }))
                        }
                        placeholder="Children"
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <input
                        value={guestCountForm.code}
                        onChange={(event) =>
                          setGuestCountForm((current) => ({
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="1A2C"
                        maxLength={30}
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 font-mono text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <input
                        value={guestCountForm.label}
                        onChange={(event) =>
                          setGuestCountForm((current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                        placeholder="1 Adult + 2 Children"
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : editingId !== null
                          ? "Save Changes"
                          : "Add Guest Count"}
                      </button>
                    </div>
                  </form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/60 text-slate-400">
                        <th className="px-5 py-4 text-left font-medium">
                          Adults
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Children
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Code
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Label
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Status
                        </th>
                        {isAdmin && (
                          <th className="px-5 py-4 text-center font-medium">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {filteredGuestCounts.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-800/70 hover:bg-slate-800/30"
                        >
                          <td className="px-5 py-4 font-semibold text-white">
                            {item.adults}
                          </td>
                          <td className="px-5 py-4 font-semibold text-white">
                            {item.children}
                          </td>
                          <td className="px-5 py-4 font-mono font-semibold text-blue-300">
                            {item.code}
                          </td>
                          <td className="px-5 py-4 text-slate-200">
                            {item.label}
                          </td>
                          <td className="px-5 py-4">
                            {renderStatus(item.is_active)}
                          </td>
                          {isAdmin && (
                            <td className="px-5 py-4">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startGuestCountEdit(item)}
                                  disabled={saving}
                                  className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleGuestCount(item)}
                                  disabled={saving}
                                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                    item.is_active
                                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                                      : "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                                  }`}
                                >
                                  {item.is_active ? "Deactivate" : "Activate"}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!loading && filteredGuestCounts.length === 0 && (
                    <div className="p-12 text-center text-sm text-slate-500">
                      No guest count options match your search.
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === "booking-payment-types" && (
              <>
                {isAdmin && (
                  <form
                    onSubmit={handleBookingPaymentTypeSubmit}
                    className="border-b border-slate-700/60 bg-[#0b1220] p-5"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">
                          {editingId !== null
                            ? "Edit Booking / Payment Type"
                            : "Add Booking / Payment Type"}
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">
                          Manage the booking source and payment status options shown in New Reservation.
                        </p>
                      </div>

                      {editingId !== null && (
                        <button
                          type="button"
                          onClick={resetForms}
                          disabled={saving}
                          className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <input
                        value={bookingPaymentTypeForm.code}
                        onChange={(event) =>
                          setBookingPaymentTypeForm((current) => ({
                            ...current,
                            code: event.target.value.toLowerCase(),
                          }))
                        }
                        placeholder="booking_paid"
                        className={`rounded-xl border px-4 py-3 font-mono text-sm outline-none ${
                          editingId !== null
                            ? "cursor-not-allowed border-slate-700 bg-slate-800/60 text-slate-500"
                            : "border-slate-600 bg-[#111827] text-white focus:border-blue-500"
                        }`}
                        disabled={saving || editingId !== null}
                      />

                      <input
                        value={bookingPaymentTypeForm.source}
                        onChange={(event) =>
                          setBookingPaymentTypeForm((current) => ({
                            ...current,
                            source: event.target.value,
                          }))
                        }
                        placeholder="Booking.com"
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />

                      <select
                        value={bookingPaymentTypeForm.payment_method}
                        onChange={(event) =>
                          setBookingPaymentTypeForm((current) => ({
                            ...current,
                            payment_method: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      >
                        <option value="Paid" className="bg-white text-slate-900">
                          Paid
                        </option>
                        <option value="Cash" className="bg-white text-slate-900">
                          Cash
                        </option>
                      </select>

                      <input
                        value={bookingPaymentTypeForm.label}
                        onChange={(event) =>
                          setBookingPaymentTypeForm((current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                        placeholder="Booking.com — Paid"
                        className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        disabled={saving}
                      />
                    </div>

                    <div className="mt-4">
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : editingId !== null
                          ? "Save Changes"
                          : "Add Booking / Payment Type"}
                      </button>
                    </div>
                  </form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/60 text-slate-400">
                        <th className="px-5 py-4 text-left font-medium">
                          Code
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Booking Source
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Payment
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Label
                        </th>
                        <th className="px-5 py-4 text-left font-medium">
                          Status
                        </th>
                        {isAdmin && (
                          <th className="px-5 py-4 text-center font-medium">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {filteredBookingPaymentTypes.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-800/70 hover:bg-slate-800/30"
                        >
                          <td className="px-5 py-4 font-mono font-semibold text-blue-300">
                            {item.code}
                          </td>
                          <td className="px-5 py-4 font-medium text-white">
                            {item.source}
                          </td>
                          <td className="px-5 py-4">
                            <span className={item.payment_method.toLowerCase() === "cash" ? "text-yellow-300" : "text-green-300"}>
                              {item.payment_method}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-200">
                            {item.label}
                          </td>
                          <td className="px-5 py-4">
                            {renderStatus(item.is_active)}
                          </td>
                          {isAdmin && (
                            <td className="px-5 py-4">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startBookingPaymentTypeEdit(item)}
                                  disabled={saving}
                                  className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleBookingPaymentType(item)}
                                  disabled={saving}
                                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                    item.is_active
                                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                                      : "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                                  }`}
                                >
                                  {item.is_active ? "Deactivate" : "Activate"}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!loading && filteredBookingPaymentTypes.length === 0 && (
                    <div className="p-12 text-center text-sm text-slate-500">
                      No Booking / Payment types match your search.
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === "rate-plans" && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-slate-400">
                      <th className="px-5 py-4 text-left font-medium">
                        Code
                      </th>
                      <th className="px-5 py-4 text-left font-medium">
                        Plan
                      </th>
                      <th className="px-5 py-4 text-left font-medium">
                        Meals
                      </th>
                      <th className="px-5 py-4 text-left font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {ratePlans.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-800/70 hover:bg-slate-800/30"
                      >
                        <td className="px-5 py-5">
                          <span className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 font-mono font-bold text-blue-300">
                            {item.code}
                          </span>
                        </td>
                        <td className="px-5 py-5 font-semibold text-white">
                          {item.name}
                        </td>
                        <td className="px-5 py-5 text-slate-300">
                          {item.meals || "-"}
                        </td>
                        <td className="px-5 py-5">
                          {renderStatus(item.is_active)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!loading && ratePlans.length === 0 && (
                  <div className="p-12 text-center text-sm text-slate-500">
                    No rate plans found.
                  </div>
                )}

                <div className="border-t border-slate-700/60 bg-[#0b1220] p-5">
                  <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-4 text-sm text-slate-300">
                    <span className="font-semibold text-blue-300">
                      Fixed business rule:
                    </span>{" "}
                    RO, B.B, H.B and F.B are seeded by the backend and
                    are intentionally not editable from this screen.
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/hotels"
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500"
            >
              🏨 Hotels
            </Link>

            <Link
              href="/new-reservation"
              className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              ➕ New Reservation
            </Link>

            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-700 px-5 py-3 text-slate-300 transition hover:bg-slate-800"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
