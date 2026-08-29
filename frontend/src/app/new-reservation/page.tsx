"use client";

import Link from "next/link";
import { apiGet, apiPost } from "../lib/api";
import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

type Hotel = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
};

type RoomType = {
  id: number;
  name: string;
  code?: string | null;
  is_active: boolean;
};

type RatePlan = {
  id: number;
  code: string;
  name: string;
  meals: string | null;
  is_active: boolean;
};

type Nationality = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
};

type GuestCountOption = {
  id: number;
  adults: number;
  children: number;
  code: string;
  label: string;
  is_active: boolean;
};

type ReservationRoomForm = {
  room_type_id: string;
  rate_plan_id: string;
  total_price_usd: string;
};

type SavedReservation = {
  id: number;
  booking_number: string;
  hotel_id: number | null;
  hotel: Hotel | null;
  guest_name: string | null;
  total_guest: number | null;
  adult_count?: number | null;
  child_count?: number | null;
  guest_count_label?: string | null;
  nationality: string | null;
  check_in: string | null;
  check_out: string | null;
  payment_type: string | null;
  payment_label?: string;
  rooms: unknown[];
  room_count: number;
  total_price_usd: number;
  total_price_egp: number | null;
  guest_requests: string | null;
  status: string;
  created_by: string | null;
  hotel_confirmation_number: string | null;
  email_status: string;
  email_sent_at: string | null;
  email_error: string | null;
};

const PAYMENT_TYPES = [
  { value: "booking_paid", label: "Booking.com — Paid", source: "Booking.com", cash: false },
  { value: "booking_cash", label: "Booking.com — Cash", source: "Booking.com", cash: true },
  { value: "expedia_paid", label: "Expedia — Paid", source: "Expedia", cash: false },
  { value: "expedia_cash", label: "Expedia — Cash", source: "Expedia", cash: true },
  { value: "trip_paid", label: "Trip.com — Paid", source: "Trip.com", cash: false },
  { value: "trip_cash", label: "Trip.com — Cash", source: "Trip.com", cash: true },
  { value: "agoda_paid", label: "Agoda — Paid", source: "Agoda", cash: false },
  { value: "agoda_cash", label: "Agoda — Cash", source: "Agoda", cash: true },
];

function parseFlexibleDate(value: string): string | null {
  const cleaned = value.trim().replace(/-/g, "/");
  if (!cleaned) return null;

  const parts = cleaned.split("/");
  if (parts.length !== 3) return null;

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  let year = Number(parts[2]);

  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return null;
  }

  if (year < 100) year += 2000;

  if (
    year < 2000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function displayDate(value: string): string {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
}

function calculateNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;

  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const difference = end.getTime() - start.getTime();

  const nights = Math.round(difference / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : 0;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function createEmptyRoom(): ReservationRoomForm {
  return {
    room_type_id: "",
    rate_plan_id: "",
    total_price_usd: "",
  };
}

async function ensureRoomTypeExists(searchValue: string): Promise<RoomType> {
  const name = searchValue.trim();

  if (!name) {
    throw new Error("Room type name is required.");
  }

  const data = await apiPost<{
    success: boolean;
    message: string;
    room_type: RoomType;
  }>("/room-types/ensure", {
    name,
  });

  if (!data?.room_type?.id) {
    throw new Error("The Room Type could not be created or found.");
  }

  return data.room_type;
}

function formatGuestComposition(adults: number, children: number) {
  const parts: string[] = [];

  if (adults > 0) {
    parts.push(`${adults} Adult${adults === 1 ? "" : "s"}`);
  }

  if (children > 0) {
    parts.push(`${children} Child${children === 1 ? "" : "ren"}`);
  }

  return parts.join(" + ") || "0";
}

function getCurrentUserName(): string {
  try {
    const rawUser =
      localStorage.getItem("hotel_user") ||
      localStorage.getItem("user");

    if (!rawUser) return "Reservations Department";

    const user = JSON.parse(rawUser);

    return (
      user?.full_name ||
      user?.username ||
      "Reservations Department"
    );
  } catch {
    return "Reservations Department";
  }
}

export default function NewReservationPage() {
  // =========================================================
  // Master data
  // =========================================================
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [guestCountOptions, setGuestCountOptions] = useState<GuestCountOption[]>([]);

  const [loadingHotels, setLoadingHotels] = useState(true);
  const [loadingRoomTypes, setLoadingRoomTypes] = useState(true);
  const [loadingRatePlans, setLoadingRatePlans] = useState(true);
  const [loadingNationalities, setLoadingNationalities] = useState(true);
  const [loadingGuestCounts, setLoadingGuestCounts] = useState(true);

  // =========================================================
  // Reservation data
  // =========================================================
  const [bookingNumber, setBookingNumber] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [hotelSearch, setHotelSearch] = useState("");
  const [hotelDropdownOpen, setHotelDropdownOpen] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [totalGuest, setTotalGuest] = useState("1");
  const [adultCount, setAdultCount] = useState("1");
  const [childCount, setChildCount] = useState("0");

  const [guestCountSearch, setGuestCountSearch] = useState("");
  const [selectedGuestCountId, setSelectedGuestCountId] = useState("");

  const [nationalityInput, setNationalityInput] = useState("");
  const [nationalityDropdownOpen, setNationalityDropdownOpen] = useState(false);

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [checkInInput, setCheckInInput] = useState("");
  const [checkOutInput, setCheckOutInput] = useState("");

  // =========================================================
  // Rooms
  // =========================================================
  const [rooms, setRooms] = useState<ReservationRoomForm[]>([
    createEmptyRoom(),
  ]);

  const [roomTypeSearchByIndex, setRoomTypeSearchByIndex] =
    useState<Record<number, string>>({});
  const [roomDropdownOpenByIndex, setRoomDropdownOpenByIndex] =
    useState<Record<number, boolean>>({});

  // =========================================================
  // Payment / other
  // =========================================================
  const [reservationType, setReservationType] = useState("booking_paid");
  const [exchangeRate, setExchangeRate] = useState("");
  const [guestRequests, setGuestRequests] = useState("");

  // =========================================================
  // Saving / email
  // =========================================================
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [savedReservation, setSavedReservation] =
    useState<SavedReservation | null>(null);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  // =========================================================
  // Load master data
  // =========================================================
  useEffect(() => {
    const loadHotels = async () => {
      try {
        setLoadingHotels(true);
        const data = await apiGet<Hotel[]>("/hotels");
        setHotels(
          Array.isArray(data)
            ? data.filter((hotel) => hotel.is_active)
            : []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "An error occurred while loading hotels"
        );
      } finally {
        setLoadingHotels(false);
      }
    };

    loadHotels();
  }, []);

  useEffect(() => {
    const loadRoomTypes = async () => {
      try {
        setLoadingRoomTypes(true);
        const data = await apiGet<RoomType[]>("/room-types");
        setRoomTypes(
          Array.isArray(data)
            ? data.filter((room) => room.is_active)
            : []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "An error occurred while loading room types"
        );
      } finally {
        setLoadingRoomTypes(false);
      }
    };

    loadRoomTypes();
  }, []);

  useEffect(() => {
    const loadRatePlans = async () => {
      try {
        setLoadingRatePlans(true);
        const data = await apiGet<RatePlan[]>("/rate-plans");
        setRatePlans(
          Array.isArray(data)
            ? data.filter((rate) => rate.is_active)
            : []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "An error occurred while loading rate plans"
        );
      } finally {
        setLoadingRatePlans(false);
      }
    };

    loadRatePlans();
  }, []);

  useEffect(() => {
    const loadNationalities = async () => {
      try {
        setLoadingNationalities(true);
        const data = await apiGet<Nationality[]>("/nationalities");
        setNationalities(
          Array.isArray(data)
            ? data.filter((nationality) => nationality.is_active)
            : []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "An error occurred while loading nationalities"
        );
      } finally {
        setLoadingNationalities(false);
      }
    };

    loadNationalities();
  }, []);

  useEffect(() => {
    const loadGuestCountOptions = async () => {
      try {
        setLoadingGuestCounts(true);
        const data = await apiGet<GuestCountOption[]>(
          "/guest-count-options"
        );

        setGuestCountOptions(
          Array.isArray(data)
            ? data.filter((option) => option.is_active)
            : []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "An error occurred while loading guest count options"
        );
      } finally {
        setLoadingGuestCounts(false);
      }
    };

    loadGuestCountOptions();
  }, []);

  // =========================================================
  // Calculations
  // =========================================================
  const nights = useMemo(
    () => calculateNights(checkIn, checkOut),
    [checkIn, checkOut]
  );

  const isCash = reservationType.endsWith("_cash");

  const exchangeRateNumber =
    exchangeRate !== "" ? Number(exchangeRate) : null;

  const totalPriceUsd = useMemo(() => {
    return rooms.reduce((total, room) => {
      const price = Number(room.total_price_usd);

      if (!Number.isFinite(price) || price < 0) {
        return total;
      }

      return total + price;
    }, 0);
  }, [rooms]);

  const totalPriceEgp = useMemo(() => {
    if (
      !isCash ||
      exchangeRateNumber === null ||
      !Number.isFinite(exchangeRateNumber) ||
      exchangeRateNumber <= 0
    ) {
      return null;
    }

    return totalPriceUsd * exchangeRateNumber;
  }, [isCash, totalPriceUsd, exchangeRateNumber]);

  const totalNightlyUsd = useMemo(() => {
    if (nights <= 0) return null;
    return totalPriceUsd / nights;
  }, [totalPriceUsd, nights]);

  const totalNightlyEgp = useMemo(() => {
    if (
      totalNightlyUsd === null ||
      !isCash ||
      exchangeRateNumber === null ||
      !Number.isFinite(exchangeRateNumber) ||
      exchangeRateNumber <= 0
    ) {
      return null;
    }

    return totalNightlyUsd * exchangeRateNumber;
  }, [totalNightlyUsd, isCash, exchangeRateNumber]);

  // =========================================================
  // Filtered data
  // =========================================================
  const selectedHotel =
    hotels.find((hotel) => hotel.id === Number(hotelId)) || null;

  const filteredHotels = useMemo(() => {
    const query = hotelSearch.trim().toLowerCase();

    if (!query) return hotels;

    return hotels.filter((hotel) =>
      hotel.name.toLowerCase().includes(query)
    );
  }, [hotels, hotelSearch]);

  const normalizedNationalitySearch =
    nationalityInput.trim().toLowerCase();

  const filteredNationalities = useMemo(() => {
    if (!normalizedNationalitySearch) return nationalities;

    return nationalities.filter(
      (nationality) =>
        nationality.code
          .toLowerCase()
          .includes(normalizedNationalitySearch) ||
        nationality.name
          .toLowerCase()
          .includes(normalizedNationalitySearch)
    );
  }, [nationalities, normalizedNationalitySearch]);

  const selectedNationality =
    nationalities.find(
      (nationality) =>
        nationality.code.toLowerCase() === normalizedNationalitySearch ||
        nationality.name.toLowerCase() === normalizedNationalitySearch
    ) || null;

  const nationalityCode =
    selectedNationality?.code ||
    nationalityInput.trim().toUpperCase();

  const nationalityName = selectedNationality?.name || "";

  const filteredGuestCounts = useMemo(() => {
    const query = guestCountSearch.trim().toLowerCase();

    if (!query) return guestCountOptions;

    return guestCountOptions.filter(
      (option) =>
        option.code.toLowerCase().includes(query) ||
        option.label.toLowerCase().includes(query) ||
        String(option.adults).includes(query)
    );
  }, [guestCountOptions, guestCountSearch]);

  const selectedGuestCount =
    guestCountOptions.find(
      (option) => selectedGuestCountId === String(option.id)
    ) || null;

  // =========================================================
  // Date handlers
  // =========================================================
  const handleCheckInBlur = () => {
    if (!checkInInput.trim()) {
      setCheckIn("");
      return;
    }

    const parsed = parseFlexibleDate(checkInInput);

    if (parsed) {
      setCheckIn(parsed);
      setCheckInInput(displayDate(parsed));
    }
  };

  const handleCheckOutBlur = () => {
    if (!checkOutInput.trim()) {
      setCheckOut("");
      return;
    }

    const parsed = parseFlexibleDate(checkOutInput);

    if (parsed) {
      setCheckOut(parsed);
      setCheckOutInput(displayDate(parsed));
    }
  };

  // =========================================================
  // Room handlers
  // =========================================================
  const handleRoomCountChange = (value: string) => {
    setError("");

    if (value === "") {
      setRooms([]);
      return;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) return;

    const count = Math.min(50, Math.max(1, Math.floor(parsed)));

    setRooms((currentRooms) => {
      const updated = [...currentRooms];

      while (updated.length < count) {
        updated.push(createEmptyRoom());
      }

      while (updated.length > count) {
        updated.pop();
      }

      return updated;
    });
  };

  const updateRoom = (
    index: number,
    field: keyof ReservationRoomForm,
    value: string
  ) => {
    setRooms((currentRooms) =>
      currentRooms.map((room, roomIndex) =>
        roomIndex === index
          ? {
              ...room,
              [field]: value,
            }
          : room
      )
    );
  };

  const selectRoomType = (index: number, room: RoomType) => {
    updateRoom(index, "room_type_id", String(room.id));

    setRoomTypeSearchByIndex((current) => ({
      ...current,
      [index]: "",
    }));

    setRoomDropdownOpenByIndex((current) => ({
      ...current,
      [index]: false,
    }));
  };

  // =========================================================
  // Reset
  // =========================================================
  const resetForm = () => {
    setBookingNumber("");
    setHotelId("");
    setHotelSearch("");
    setHotelDropdownOpen(false);

    setGuestName("");
    setTotalGuest("1");
    setAdultCount("1");
    setChildCount("0");
    setGuestCountSearch("");
    setSelectedGuestCountId("");

    setNationalityInput("");
    setNationalityDropdownOpen(false);

    setCheckIn("");
    setCheckOut("");
    setCheckInInput("");
    setCheckOutInput("");

    setRooms([createEmptyRoom()]);
    setRoomTypeSearchByIndex({});
    setRoomDropdownOpenByIndex({});

    setReservationType("booking_paid");
    setExchangeRate("");
    setGuestRequests("");

    setSavedReservation(null);
    setMessage("");
    setError("");
    setEmailMessage("");
    setEmailError("");
  };

  // =========================================================
  // Submit
  // =========================================================
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setMessage("");
    setError("");
    setEmailMessage("");
    setEmailError("");

    if (!bookingNumber.trim()) {
      setError("Please enter the booking number");
      return;
    }

    if (!hotelId) {
      setError("Please select a hotel");
      return;
    }

    if (!guestName.trim()) {
      setError("Please enter the guest name");
      return;
    }

    const adultCountNumber = Number(adultCount || 0);
    const childCountNumber = Number(childCount || 0);

    if (
      !Number.isInteger(adultCountNumber) ||
      adultCountNumber < 0 ||
      !Number.isInteger(childCountNumber) ||
      childCountNumber < 0 ||
      adultCountNumber + childCountNumber < 1
    ) {
      setError(
        "Enter at least one guest, with adults and children kept separate"
      );
      return;
    }

    const totalGuestNumber = adultCountNumber;

    if (!checkIn || !checkOut) {
      setError("Please enter check-in and check-out dates");
      return;
    }

    if (nights <= 0) {
      setError("Check-out date must be after check-in date");
      return;
    }

    if (nationalityInput.trim() && !selectedNationality) {
      setError(
        `Nationality "${nationalityInput.trim()}" was not found.`
      );
      return;
    }

    if (!rooms.length) {
      setError("At least one room is required");
      return;
    }

    for (let index = 0; index < rooms.length; index++) {
      const room = rooms[index];

      if (
        !room.room_type_id &&
        !(roomTypeSearchByIndex[index] || "").trim()
      ) {
        setError(
          `Please select or enter room type number ${index + 1}`
        );
        return;
      }

      if (!room.rate_plan_id) {
        setError(
          `Please select a Rate Plan for room ${index + 1}`
        );
        return;
      }

      const roomPrice = Number(room.total_price_usd);

      if (
        room.total_price_usd === "" ||
        !Number.isFinite(roomPrice) ||
        roomPrice < 0
      ) {
        setError(
          `Please enter the price for room ${index + 1} in USD`
        );
        return;
      }
    }

    if (isCash) {
      if (
        exchangeRateNumber === null ||
        !Number.isFinite(exchangeRateNumber) ||
        exchangeRateNumber <= 0
      ) {
        setError("Please enter the cash exchange rate");
        return;
      }
    }

    try {
      setSaving(true);

      const resolvedRoomTypeIds = rooms.map((room) => room.room_type_id);

      for (let index = 0; index < rooms.length; index++) {
        if (resolvedRoomTypeIds[index]) {
          continue;
        }

        const searchValue = (roomTypeSearchByIndex[index] || "").trim();

        const ensuredRoomType = await ensureRoomTypeExists(searchValue);

        resolvedRoomTypeIds[index] = String(ensuredRoomType.id);

        setRoomTypes((currentRoomTypes) =>
          currentRoomTypes.some((type) => type.id === ensuredRoomType.id)
            ? currentRoomTypes
            : [...currentRoomTypes, ensuredRoomType]
        );
      }

      const createdBy = getCurrentUserName();

      const data = await apiPost<{
        success: boolean;
        message: string;
        reservation: SavedReservation;
      }>("/reservations", {
        booking_number: bookingNumber.trim(),
        hotel_id: Number(hotelId),
        guest_name: guestName.trim() || null,
        total_guest: totalGuestNumber,
        adult_count: adultCountNumber,
        child_count: childCountNumber,
        nationality: nationalityCode || null,
        check_in: checkIn,
        check_out: checkOut,
        payment_type: reservationType,
        rooms: rooms.map((room, index) => ({
          room_type_id: Number(resolvedRoomTypeIds[index]),
          rate_plan_id: Number(room.rate_plan_id),
          total_price_usd: Number(room.total_price_usd),
        })),
        exchange_rate: isCash ? exchangeRateNumber : null,
        guest_requests: guestRequests.trim() || null,
        created_by: createdBy,
      });

      const reservation = data.reservation as SavedReservation;

      setSavedReservation(reservation);

      setMessage(
        `Reservation ${reservation.booking_number} created successfully`
      );

      setEmailMessage("");
      setEmailError("");
      setShowEmailConfirmation(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while creating the reservation"
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // Email
  // =========================================================
  const handleSendEmail = async () => {
    if (!savedReservation) return;

    setSendingEmail(true);
    setEmailMessage("");
    setEmailError("");

    try {
      const createdBy = getCurrentUserName();

      const data = await apiPost<{
        success: boolean;
        message: string;
        booking_number: string;
        hotel: string;
        email: string;
        sent_by?: string | null;
        email_status: string;
        email_sent_at: string | null;
      }>(
        `/reservation/${encodeURIComponent(
          savedReservation.booking_number
        )}/send-email`,
        {
          sent_by: createdBy,
        }
      );

      setEmailMessage(
        `Reservation sent successfully to ${data.email}`
      );

      setSavedReservation((current) =>
        current
          ? {
              ...current,
              email_status: "sent",
              email_sent_at: data.email_sent_at,
              email_error: null,
            }
          : current
      );

      window.setTimeout(() => {
        setShowEmailConfirmation(false);
      }, 1800);
    } catch (err) {
      setEmailError(
        err instanceof Error
          ? err.message
          : "An error occurred while sending the email"
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSkipEmail = () => {
    setShowEmailConfirmation(false);
    setEmailMessage("");
    setEmailError("");
    resetForm();
  };

  // =========================================================
  // UI
  // =========================================================
  const disabled =
    saving ||
    loadingHotels ||
    loadingRoomTypes ||
    loadingRatePlans ||
    loadingNationalities ||
    loadingGuestCounts;

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#070d1d] text-white selection:bg-violet-500/30"
    >
      <header className="sticky top-0 z-40 h-[74px] border-b border-white/10 bg-[#070d1d]/95 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between px-5 lg:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-2xl shadow-lg shadow-violet-950/30">
              🏨
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Hotel Reservation
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Reservation Management System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-lg text-slate-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 sm:flex"
              aria-label="Theme"
            >
              ☾
            </button>

            <div className="hidden items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold">
                MA
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-4">
                  {getCurrentUserName()}
                </p>
                <p className="text-[11px] text-slate-500">Administrator</p>
              </div>
              <span className="ml-2 text-slate-500">⌄</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1700px] gap-4 p-4 lg:p-5">
        <aside className="hidden w-[235px] shrink-0 flex-col rounded-2xl border border-white/10 bg-[#0b1328] p-3 lg:flex">
          <nav className="space-y-1">
            <SideLink active icon="▣" label="Booking" href="/new-reservation" />
            <SideLink icon="▤" label="Reservations" href="/reservations" />
            <SideLink icon="♙" label="Guests" href="/master-data" />
            <SideLink icon="▱" label="Rooms" href="/hotels" />
            <SideLink icon="▥" label="Reports" href="/reports" />
            <SideLink icon="⚙" label="Settings" href="/settings" />
          </nav>

          <div className="mt-auto pt-8">
            <div className="rounded-xl border border-white/10 bg-[#0d1730] p-3">
              <p className="mb-3 px-1 text-xs font-semibold text-violet-300">
                Quick Actions
              </p>

              <Link
                href="/new-reservation"
                className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2.5 text-sm font-semibold shadow-lg shadow-violet-950/20 transition hover:brightness-110"
              >
                <span className="text-lg">＋</span>
                New Booking
              </Link>

              <Link
                href="/reservations"
                className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-violet-500/50 hover:bg-violet-500/10"
              >
                ▣ View Bookings
              </Link>

              <div className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-400">
                <p>▣ {new Date().toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}</p>
                <p className="mt-3">◷ {new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <form onSubmit={handleSubmit}>
            <div className="overflow-hidden rounded-2xl border border-violet-500/50 bg-[#0a1227] shadow-2xl shadow-black/20">
              <div className="border-b border-white/10 px-5 py-5 sm:px-7 sm:py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-3xl text-violet-300 ring-1 ring-violet-500/20">
                      ▣
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        Booking Details
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Enter the booking information
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-5 py-3">
                    <span className="text-xs text-violet-300">
                      Booking ID
                    </span>
                    <span className="ml-4 text-xl font-bold text-fuchsia-300">
                      {bookingNumber || "—"}
                    </span>
                  </div>
                </div>

                <div className="mt-5 h-px bg-gradient-to-r from-fuchsia-500 via-violet-500/60 to-transparent" />
              </div>

              <div className="grid lg:grid-cols-2">
                <div className="border-b border-white/10 lg:border-b-0 lg:border-r">
                  <BookingField
                    icon="▣"
                    label="Booking number"
                    required
                  >
                    <input
                      value={bookingNumber}
                      onChange={(e) => setBookingNumber(e.target.value)}
                      placeholder="Enter booking number"
                      className={inputClass}
                    />
                  </BookingField>

                  <BookingField icon="▥" label="Hotel Name" required>
                    <div className="relative">
                      <input
                        type="text"
                        value={hotelSearch || selectedHotel?.name || ""}
                        onFocus={() => {
                          if (selectedHotel && !hotelSearch) {
                            setHotelSearch("");
                          }
                          setHotelDropdownOpen(true);
                        }}
                        onChange={(e) => {
                          setHotelSearch(e.target.value);
                          setHotelId("");
                          setHotelDropdownOpen(true);
                        }}
                        onBlur={() => {
                          window.setTimeout(
                            () => setHotelDropdownOpen(false),
                            150
                          );
                        }}
                        placeholder={
                          loadingHotels
                            ? "Loading hotels..."
                            : "Enter hotel name"
                        }
                        disabled={loadingHotels}
                        autoComplete="off"
                        className={inputClass}
                      />

                      {hotelDropdownOpen && !loadingHotels && (
                        <Dropdown>
                          {filteredHotels.length > 0 ? (
                            filteredHotels.slice(0, 25).map((hotel) => (
                              <button
                                type="button"
                                key={hotel.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setHotelId(String(hotel.id));
                                  setHotelSearch("");
                                  setHotelDropdownOpen(false);
                                }}
                                className="block w-full px-4 py-3 text-left text-sm transition hover:bg-violet-500/10"
                              >
                                <span className="font-semibold text-slate-100">
                                  {hotel.name}
                                </span>
                                {hotel.email && (
                                  <span className="ml-2 text-xs text-slate-500">
                                    {hotel.email}
                                  </span>
                                )}
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-slate-500">
                              No hotel found for "{hotelSearch}"
                            </div>
                          )}
                        </Dropdown>
                      )}
                    </div>
                  </BookingField>

                  <BookingField icon="♙" label="total guest" required>
                    <div className="relative">
                      <input
                        type="text"
                        value={guestCountSearch}
                        onChange={(e) => {
                          setGuestCountSearch(e.target.value);
                          setSelectedGuestCountId("");
                        }}
                        placeholder="Enter total guests"
                        className={inputClass}
                        disabled={loadingGuestCounts}
                      />

                      {guestCountSearch.trim() &&
                        filteredGuestCounts.length > 0 && (
                          <Dropdown>
                            {filteredGuestCounts.slice(0, 20).map((option) => (
                              <button
                                type="button"
                                key={option.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setSelectedGuestCountId(String(option.id));
                                  setGuestCountSearch(
                                    `${option.code} — ${option.label}`
                                  );
                                  setAdultCount(String(option.adults));
                                  setChildCount(String(option.children));
                                  setTotalGuest(String(option.adults));
                                }}
                                className="block w-full px-4 py-3 text-left text-sm transition hover:bg-violet-500/10"
                              >
                                <span className="font-bold text-violet-300">
                                  {option.code}
                                </span>
                                <span className="ml-2 text-slate-200">
                                  {option.label}
                                </span>
                              </button>
                            ))}
                          </Dropdown>
                        )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="0"
                        value={adultCount}
                        onChange={(e) => {
                          setAdultCount(e.target.value);
                          setTotalGuest(e.target.value);
                          setSelectedGuestCountId("");
                        }}
                        placeholder="Adults"
                        className={smallInputClass}
                      />
                      <input
                        type="number"
                        min="0"
                        value={childCount}
                        onChange={(e) => {
                          setChildCount(e.target.value);
                          setSelectedGuestCountId("");
                        }}
                        placeholder="Children"
                        className={smallInputClass}
                      />
                    </div>
                  </BookingField>

                  <BookingField icon="♙" label="Guest Name" required>
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Enter guest name"
                      className={inputClass}
                    />
                  </BookingField>

                  <BookingField icon="⚑" label="Nationality">
                    <div className="relative">
                      <input
                        value={nationalityInput}
                        onFocus={() => setNationalityDropdownOpen(true)}
                        onChange={(e) => {
                          setNationalityInput(e.target.value);
                          setNationalityDropdownOpen(true);
                        }}
                        onBlur={() => {
                          window.setTimeout(
                            () => setNationalityDropdownOpen(false),
                            150
                          );
                        }}
                        placeholder="Enter nationality"
                        className={`${inputClass} uppercase`}
                        disabled={loadingNationalities}
                        autoComplete="off"
                      />

                      {nationalityDropdownOpen &&
                        nationalityInput.trim() &&
                        filteredNationalities.length > 0 && (
                          <Dropdown>
                            {filteredNationalities.slice(0, 20).map(
                              (nationality) => (
                                <button
                                  type="button"
                                  key={nationality.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setNationalityInput(nationality.code);
                                    setNationalityDropdownOpen(false);
                                  }}
                                  className="block w-full px-4 py-3 text-left text-sm transition hover:bg-violet-500/10"
                                >
                                  <span className="font-bold text-violet-300">
                                    {nationality.code}
                                  </span>
                                  <span className="ml-2 text-slate-200">
                                    {nationality.name}
                                  </span>
                                </button>
                              )
                            )}
                          </Dropdown>
                        )}
                    </div>
                  </BookingField>

                  <BookingField icon="▣" label="Rooms" required>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={rooms.length}
                      onChange={(e) =>
                        handleRoomCountChange(e.target.value)
                      }
                      className={inputClass}
                    />
                  </BookingField>

                  <RoomFieldGroup
                    rooms={rooms}
                    roomTypes={roomTypes}
                    ratePlans={ratePlans}
                    loadingRoomTypes={loadingRoomTypes}
                    loadingRatePlans={loadingRatePlans}
                    roomTypeSearchByIndex={roomTypeSearchByIndex}
                    roomDropdownOpenByIndex={roomDropdownOpenByIndex}
                    setRoomTypeSearchByIndex={setRoomTypeSearchByIndex}
                    setRoomDropdownOpenByIndex={setRoomDropdownOpenByIndex}
                    selectRoomType={selectRoomType}
                    updateRoom={updateRoom}
                    nights={nights}
                    isCash={isCash}
                    exchangeRateNumber={exchangeRateNumber}
                    side="left"
                  />

                  <BookingField icon="▣" label="Check-In">
                    <div className="relative">
                      <input
                        type="text"
                        value={checkInInput}
                        onChange={(e) => setCheckInInput(e.target.value)}
                        onBlur={handleCheckInBlur}
                        placeholder="22-Aug-26"
                        className={`${inputClass} pr-12`}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                        ▣
                      </span>
                    </div>
                  </BookingField>

                  <BookingField icon="▣" label="Check-Out">
                    <div className="relative">
                      <input
                        type="text"
                        value={checkOutInput}
                        onChange={(e) => setCheckOutInput(e.target.value)}
                        onBlur={handleCheckOutBlur}
                        placeholder="26-Aug-26"
                        className={`${inputClass} pr-12`}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                        ▣
                      </span>
                    </div>
                  </BookingField>

                  <BookingField icon="◇" label="Reservation Type" required>
                    <select
                      value={reservationType}
                      onChange={(e) => setReservationType(e.target.value)}
                      className={inputClass}
                    >
                      {PAYMENT_TYPES.map((payment) => (
                        <option
                          key={payment.value}
                          value={payment.value}
                          className="bg-white text-slate-900"
                        >
                          {payment.label}
                        </option>
                      ))}
                    </select>
                  </BookingField>

                  <BookingField icon="$" label="Total Price">
                    <div className="relative">
                      <input
                        readOnly
                        value={formatNumber(totalPriceUsd)}
                        className={`${inputClass} pr-14 font-bold text-emerald-300`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-violet-300">
                        USD
                      </span>
                    </div>
                  </BookingField>
                </div>

                <div>
                  <BookingField icon="#" label="S. Number">
                    <input
                      type="text"
                      placeholder="Enter serial number"
                      className={inputClass}
                      disabled
                      title="Serial number is not part of the current reservation API."
                    />
                  </BookingField>

                  <RoomFieldGroup
                    rooms={rooms}
                    roomTypes={roomTypes}
                    ratePlans={ratePlans}
                    loadingRoomTypes={loadingRoomTypes}
                    loadingRatePlans={loadingRatePlans}
                    roomTypeSearchByIndex={roomTypeSearchByIndex}
                    roomDropdownOpenByIndex={roomDropdownOpenByIndex}
                    setRoomTypeSearchByIndex={setRoomTypeSearchByIndex}
                    setRoomDropdownOpenByIndex={setRoomDropdownOpenByIndex}
                    selectRoomType={selectRoomType}
                    updateRoom={updateRoom}
                    nights={nights}
                    isCash={isCash}
                    exchangeRateNumber={exchangeRateNumber}
                    side="right"
                  />

                  <BookingField icon="$" label="Guest requests">
                    <input
                      value={guestRequests}
                      onChange={(e) => setGuestRequests(e.target.value)}
                      placeholder="Enter guest requests"
                      className={inputClass}
                    />
                  </BookingField>

                  <BookingField icon="☾" label="Total Night">
                    <input
                      readOnly
                      value={nights > 0 ? String(nights) : ""}
                      placeholder="Calculated automatically"
                      className={`${inputClass} font-bold text-violet-300`}
                    />
                  </BookingField>

                  <BookingField icon="◇" label="Price / Night">
                    <input
                      readOnly
                      value={
                        totalNightlyUsd !== null
                          ? `$${formatNumber(totalNightlyUsd)}`
                          : "$0.00"
                      }
                      className={`${inputClass} font-bold text-emerald-300`}
                    />
                  </BookingField>

                  <BookingField icon="%" label="Commission">
                    <input
                      type="text"
                      placeholder="Enter commission"
                      className={inputClass}
                      disabled
                      title="Commission is not part of the current reservation create payload."
                    />
                  </BookingField>

                  <BookingField icon="$" label="Exchange Rate">
                    {isCash ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(e.target.value)}
                        placeholder="USD → EGP"
                        className={inputClass}
                      />
                    ) : (
                      <div className="flex min-h-[48px] items-center rounded-xl border border-white/10 bg-[#081126] px-4 text-sm text-slate-500">
                        Only required for Cash bookings
                      </div>
                    )}
                  </BookingField>

                  {isCash && (
                    <>
                      <BookingField icon="$" label="Total in L.E">
                        <input
                          readOnly
                          value={
                            totalPriceEgp !== null
                              ? `${formatNumber(totalPriceEgp)} EGP`
                              : "-"
                          }
                          className={`${inputClass} font-bold text-amber-300`}
                        />
                      </BookingField>

                      <BookingField icon="☾" label="Nightly Rate L.E">
                        <input
                          readOnly
                          value={
                            totalNightlyEgp !== null
                              ? `${formatNumber(totalNightlyEgp)} EGP`
                              : "-"
                          }
                          className={`${inputClass} font-bold text-amber-300`}
                        />
                      </BookingField>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-white/10 p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <SummaryItem
                    label="Nights"
                    value={nights > 0 ? `${nights} Night${nights === 1 ? "" : "s"}` : "-"}
                  />
                  <SummaryItem label="Rooms" value={String(rooms.length)} />
                  <SummaryItem
                    label="Guests"
                    value={formatGuestComposition(
                      Number(adultCount || 0),
                      Number(childCount || 0)
                    )}
                  />
                  <SummaryItem
                    label="Total USD"
                    value={`${formatNumber(totalPriceUsd)} USD`}
                  />
                  <SummaryItem
                    label="Payment Type"
                    value={
                      PAYMENT_TYPES.find(
                        (payment) => payment.value === reservationType
                      )?.label || "-"
                    }
                  />
                </div>

                {isCash && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <SummaryItem
                      label="Total L.E"
                      value={
                        totalPriceEgp !== null
                          ? `${formatNumber(totalPriceEgp)} EGP`
                          : "-"
                      }
                    />
                    <SummaryItem
                      label="Nightly Rate L.E"
                      value={
                        totalNightlyEgp !== null
                          ? `${formatNumber(totalNightlyEgp)} EGP`
                          : "-"
                      }
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="mx-5 mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 sm:mx-6">
                  {error}
                </div>
              )}

              {message && (
                <div className="mx-5 mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 sm:mx-6">
                  {message}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-500 bg-transparent px-8 py-3 text-sm font-semibold text-slate-200 transition hover:border-violet-400 hover:bg-violet-500/10"
                >
                  ↻ Reset
                </button>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    disabled
                    title="Save Draft is not available yet."
                    className="cursor-not-allowed rounded-xl border border-slate-700 bg-transparent px-8 py-3 text-sm font-semibold text-slate-500 opacity-70"
                  >
                    ▣ Save Draft
                  </button>

                  <button
                    type="submit"
                    disabled={disabled}
                    className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-9 py-3 text-sm font-bold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "✓ Save Booking"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>
      </div>

      {showEmailConfirmation && savedReservation && (
        <EmailModal
          savedReservation={savedReservation}
          emailMessage={emailMessage}
          emailError={emailError}
          sendingEmail={sendingEmail}
          onSkip={handleSkipEmail}
          onSend={handleSendEmail}
        />
      )}
    </main>
  );
}

// =============================================================
// UI components
// =============================================================

const inputClass =
  "w-full rounded-lg border border-slate-700/90 bg-[#071126] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60";

const smallInputClass =
  "w-full rounded-lg border border-slate-700/90 bg-[#071126] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20";

function SideLink({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition ${
        active
          ? "bg-gradient-to-r from-violet-600/80 to-fuchsia-600/50 text-white shadow-lg shadow-violet-950/20"
          : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-fuchsia-300" />
      )}
      <span className="w-6 text-center text-lg text-violet-300">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function BookingField({
  icon,
  label,
  required,
  children,
}: {
  icon: string;
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-[72px] grid-cols-[42px_minmax(105px,150px)_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.07] px-4 py-3 sm:grid-cols-[44px_155px_minmax(0,1fr)] sm:px-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15 text-base font-bold text-violet-300 ring-1 ring-violet-500/10">
        {icon}
      </div>

      <label className="text-sm font-medium text-slate-100">
        {label}
        {required && <span className="ml-1 text-fuchsia-400">*</span>}
      </label>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Dropdown({ children }: { children: ReactNode }) {
  return (
    <div className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-64 overflow-y-auto rounded-xl border border-violet-500/30 bg-[#091329] shadow-2xl shadow-black/50">
      {children}
    </div>
  );
}

function RoomFieldGroup({
  rooms,
  roomTypes,
  ratePlans,
  loadingRoomTypes,
  loadingRatePlans,
  roomTypeSearchByIndex,
  roomDropdownOpenByIndex,
  setRoomTypeSearchByIndex,
  setRoomDropdownOpenByIndex,
  selectRoomType,
  updateRoom,
  nights,
  isCash,
  exchangeRateNumber,
  side,
}: {
  rooms: ReservationRoomForm[];
  roomTypes: RoomType[];
  ratePlans: RatePlan[];
  loadingRoomTypes: boolean;
  loadingRatePlans: boolean;
  roomTypeSearchByIndex: Record<number, string>;
  roomDropdownOpenByIndex: Record<number, boolean>;
  setRoomTypeSearchByIndex: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  setRoomDropdownOpenByIndex: React.Dispatch<
    React.SetStateAction<Record<number, boolean>>
  >;
  selectRoomType: (index: number, room: RoomType) => void;
  updateRoom: (
    index: number,
    field: keyof ReservationRoomForm,
    value: string
  ) => void;
  nights: number;
  isCash: boolean;
  exchangeRateNumber: number | null;
  side: "left" | "right";
}) {
  const indexes =
    side === "left"
      ? rooms.map((_, index) => index).filter((index) => index % 2 === 0)
      : rooms.map((_, index) => index).filter((index) => index % 2 === 1);

  return (
    <>
      {indexes.map((index) => {
        const room = rooms[index];
        const selectedRoomType = roomTypes.find(
          (type) => String(type.id) === room.room_type_id
        );

        const search = roomTypeSearchByIndex[index] || "";

        const filteredRoomTypes = roomTypes.filter((type) => {
          const query = search.trim().toLowerCase();
          if (!query) return true;

          return (
            type.name.toLowerCase().includes(query) ||
            (type.code || "").toLowerCase().includes(query)
          );
        });

        const roomPrice =
          room.total_price_usd !== ""
            ? Number(room.total_price_usd)
            : null;

        const nightly =
          roomPrice !== null &&
          Number.isFinite(roomPrice) &&
          nights > 0
            ? roomPrice / nights
            : null;

        const roomEgp =
          isCash &&
          roomPrice !== null &&
          Number.isFinite(roomPrice) &&
          exchangeRateNumber !== null &&
          Number.isFinite(exchangeRateNumber) &&
          exchangeRateNumber > 0
            ? roomPrice * exchangeRateNumber
            : null;

        return (
          <div key={index} className="contents">
            <BookingField icon="▥" label={`Room Type (${index + 1})`} required>
              <div className="relative">
                <input
                  type="text"
                  value={
                    selectedRoomType
                      ? selectedRoomType.code
                        ? `${selectedRoomType.code} — ${selectedRoomType.name}`
                        : selectedRoomType.name
                      : search
                  }
                  onFocus={() => {
                    setRoomDropdownOpenByIndex((current) => ({
                      ...current,
                      [index]: true,
                    }));
                  }}
                  onChange={(e) => {
                    updateRoom(index, "room_type_id", "");
                    setRoomTypeSearchByIndex((current) => ({
                      ...current,
                      [index]: e.target.value,
                    }));
                    setRoomDropdownOpenByIndex((current) => ({
                      ...current,
                      [index]: true,
                    }));
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setRoomDropdownOpenByIndex((current) => ({
                        ...current,
                        [index]: false,
                      }));
                    }, 150);
                  }}
                  placeholder={
                    loadingRoomTypes
                      ? "Loading room types..."
                      : "Select room type"
                  }
                  disabled={loadingRoomTypes}
                  autoComplete="off"
                  className={`${inputClass} pr-10`}
                />

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                  ⌄
                </span>

                {roomDropdownOpenByIndex[index] && !loadingRoomTypes && (
                  <Dropdown>
                    {filteredRoomTypes.length > 0 ? (
                      filteredRoomTypes.slice(0, 20).map((type) => (
                        <button
                          type="button"
                          key={type.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectRoomType(index, type);
                          }}
                          className="block w-full px-4 py-3 text-left text-sm transition hover:bg-violet-500/10"
                        >
                          <span className="font-bold text-violet-300">
                            {type.code || "-"}
                          </span>
                          <span className="ml-2 text-slate-200">
                            {type.name}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500">
                        No room type found
                      </div>
                    )}
                  </Dropdown>
                )}
              </div>
            </BookingField>

            <BookingField icon="$" label={`Price Room (${index + 1})`} required>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={room.total_price_usd}
                  onChange={(e) =>
                    updateRoom(index, "total_price_usd", e.target.value)
                  }
                  placeholder="Enter price"
                  className={`${inputClass} pr-12`}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  $
                </span>
              </div>
              {nightly !== null && (
                <p className="mt-1 text-[11px] text-emerald-400">
                  {formatNumber(nightly)} USD / night
                  {roomEgp !== null
                    ? ` • ${formatNumber(roomEgp)} EGP total`
                    : ""}
                </p>
              )}
            </BookingField>

            <BookingField icon="▤" label={`Rate Plan (${index + 1})`} required>
              <select
                value={room.rate_plan_id}
                onChange={(e) =>
                  updateRoom(index, "rate_plan_id", e.target.value)
                }
                disabled={loadingRatePlans}
                className={inputClass}
              >
                <option value="" className="bg-white text-slate-900">
                  {loadingRatePlans
                    ? "Loading rate plans..."
                    : "Select rate plan"}
                </option>
                {ratePlans.map((rate) => (
                  <option
                    key={rate.id}
                    value={rate.id}
                    className="bg-white text-slate-900"
                  >
                    {rate.code} — {rate.name}
                    {rate.meals ? ` — ${rate.meals}` : ""}
                  </option>
                ))}
              </select>
            </BookingField>
          </div>
        );
      })}
    </>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#071126] px-4 py-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-100">
        {value}
      </p>
    </div>
  );
}

function EmailModal({
  savedReservation,
  emailMessage,
  emailError,
  sendingEmail,
  onSkip,
  onSend,
}: {
  savedReservation: SavedReservation;
  emailMessage: string;
  emailError: string;
  sendingEmail: boolean;
  onSkip: () => void;
  onSend: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-violet-500/30 bg-[#0a1227] shadow-2xl shadow-black/60">
        <div className="border-b border-white/10 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-2xl text-violet-300">
              ✉
            </div>
            <div>
              <h2 className="text-xl font-bold">
                Send Reservation to Hotel
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Reservation saved successfully. Would you like to send it to
                the hotel now?
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <ModalMeta
              label="Booking Number"
              value={savedReservation.booking_number}
            />
            <ModalMeta
              label="Hotel"
              value={savedReservation.hotel?.name || "-"}
            />
            <ModalMeta
              label="Guest"
              value={savedReservation.guest_name || "-"}
            />
            <ModalMeta
              label="Guests"
              value={
                savedReservation.guest_count_label ||
                (savedReservation.adult_count != null
                  ? `${savedReservation.adult_count} Adult${
                      savedReservation.adult_count === 1 ? "" : "s"
                    }${
                      savedReservation.child_count
                        ? ` + ${savedReservation.child_count} Child${
                            savedReservation.child_count === 1 ? "" : "ren"
                          }`
                        : ""
                    }`
                  : String(savedReservation.total_guest ?? "-"))
              }
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-white/[0.04] text-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left">Room</th>
                  <th className="px-4 py-3 text-left">Room Type</th>
                  <th className="px-4 py-3 text-left">Rate Plan</th>
                  <th className="px-4 py-3 text-left">Meals</th>
                  <th className="px-4 py-3 text-left">Price / Night</th>
                  <th className="px-4 py-3 text-left">Total</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(savedReservation.rooms) &&
                  savedReservation.rooms.map((rawRoom, index) => {
                    const room = rawRoom as {
                      room_type?: string | null;
                      rate_plan_code?: string | null;
                      rate_plan_name?: string | null;
                      meals?: string | null;
                      nightly_rate_usd?: number | null;
                      total_price_usd?: number | null;
                      nightly_rate_egp?: number | null;
                      total_price_egp?: number | null;
                    };

                    const hasEgp = room.total_price_egp != null;

                    return (
                      <tr
                        key={index}
                        className="border-t border-white/[0.07]"
                      >
                        <td className="px-4 py-3 font-bold text-violet-300">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3">
                          {room.room_type || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">
                            {room.rate_plan_code || "-"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {room.rate_plan_name || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {room.meals || "-"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-300">
                          USD {formatNumber(room.nightly_rate_usd)}
                          {hasEgp && (
                            <div className="text-xs text-amber-300">
                              EGP {formatNumber(room.nightly_rate_egp)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-300">
                          USD {formatNumber(room.total_price_usd)}
                          {hasEgp && (
                            <div className="text-xs text-amber-300">
                              EGP {formatNumber(room.total_price_egp)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ModalMeta
              label="Check-in"
              value={savedReservation.check_in || "-"}
            />
            <ModalMeta
              label="Check-out"
              value={savedReservation.check_out || "-"}
            />
            <ModalMeta
              label="Payment"
              value={
                savedReservation.payment_label ||
                savedReservation.payment_type ||
                "-"
              }
            />
          </div>

          {savedReservation.guest_requests && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs text-slate-500">Guest Requests</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                {savedReservation.guest_requests}
              </p>
            </div>
          )}

          <div className="mt-5 border-t border-white/10 pt-4 text-right">
            <div className="text-xl font-black text-emerald-300">
              USD {formatNumber(savedReservation.total_price_usd)}
            </div>
            {savedReservation.total_price_egp != null && (
              <div className="font-semibold text-amber-300">
                EGP {formatNumber(savedReservation.total_price_egp)}
              </div>
            )}
          </div>

          {emailMessage && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              ✓ {emailMessage}
            </div>
          )}

          {emailError && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              ✕ {emailError}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onSkip}
              disabled={sendingEmail}
              className="rounded-xl border border-slate-600 bg-white/[0.03] px-6 py-3 font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50"
            >
              No, later
            </button>

            <button
              type="button"
              onClick={onSend}
              disabled={sendingEmail || !savedReservation.hotel?.email}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingEmail
                ? "Sending reservation..."
                : "Send Reservation by Email"}
            </button>
          </div>

          {!savedReservation.hotel?.email && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Add a hotel email in Hotel Information first, then you can send
              the reservation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#071126] p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-semibold text-slate-100">{value}</p>
    </div>
  );
}
