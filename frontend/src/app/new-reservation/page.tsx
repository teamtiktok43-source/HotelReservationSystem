"use client";

import Link from "next/link";
import { apiGet, apiPost } from "../lib/api";
import {
  FormEvent,
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
  {
    value: "booking_paid",
    label: "Booking.com — Paid",
    source: "Booking.com",
    cash: false,
  },
  {
    value: "booking_cash",
    label: "Booking.com — Cash",
    source: "Booking.com",
    cash: true,
  },
  {
    value: "expedia_paid",
    label: "Expedia — Paid",
    source: "Expedia",
    cash: false,
  },
  {
    value: "expedia_cash",
    label: "Expedia — Cash",
    source: "Expedia",
    cash: true,
  },
  {
    value: "trip_paid",
    label: "Trip.com — Paid",
    source: "Trip.com",
    cash: false,
  },
  {
    value: "trip_cash",
    label: "Trip.com — Cash",
    source: "Trip.com",
    cash: true,
  },
  {
    value: "agoda_paid",
    label: "Agoda — Paid",
    source: "Agoda",
    cash: false,
  },
  {
    value: "agoda_cash",
    label: "Agoda — Cash",
    source: "Agoda",
    cash: true,
  },
];

function parseFlexibleDate(
  value: string
): string | null {
  const cleaned = value
    .trim()
    .replace(/-/g, "/");

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

  if (year < 100) {
    year += 2000;
  }

  if (
    year < 2000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(
    year,
    month - 1,
    day
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

function displayDate(
  value: string
): string {
  if (!value) return "";

  const parts = value.split("-");

  if (parts.length !== 3) return value;

  return `${parts[2]}/${parts[1]}/${parts[0].slice(
    -2
  )}`;
}

function calculateNights(
  checkIn: string,
  checkOut: string
): number {
  if (!checkIn || !checkOut) return 0;

  const start = new Date(
    `${checkIn}T00:00:00`
  );

  const end = new Date(
    `${checkOut}T00:00:00`
  );

  const difference =
    end.getTime() - start.getTime();

  const nights = Math.round(
    difference /
      (1000 * 60 * 60 * 24)
  );

  return nights > 0 ? nights : 0;
}

function formatNumber(
  value: number | null
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
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

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function roomTypeMatchesSearch(room: RoomType, search: string) {
  const value = normalizeSearchValue(search);

  if (!value) return true;

  return (
    normalizeSearchValue(room.name).includes(value) ||
    normalizeSearchValue(room.code || "").includes(value)
  );
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

    if (!rawUser) {
      return "Reservations Department";
    }

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
  // =====================================================
  // Master Data
  // =====================================================

  const [hotels, setHotels] =
    useState<Hotel[]>([]);

  const [roomTypes, setRoomTypes] =
    useState<RoomType[]>([]);

  const [ratePlans, setRatePlans] =
    useState<RatePlan[]>([]);

  const [nationalities, setNationalities] =
    useState<Nationality[]>([]);

  const [guestCountOptions, setGuestCountOptions] =
    useState<GuestCountOption[]>([]);

  const [loadingNationalities, setLoadingNationalities] =
    useState(true);

  const [loadingGuestCounts, setLoadingGuestCounts] =
    useState(true);

  const [roomTypeSearchByIndex, setRoomTypeSearchByIndex] =
    useState<Record<number, string>>({});

  const [nationalitySearch, setNationalitySearch] =
    useState("");

  const [guestCountSearch, setGuestCountSearch] =
    useState("");

  const [selectedGuestCountId, setSelectedGuestCountId] =
    useState("");

  const [loadingHotels, setLoadingHotels] =
    useState(true);

  const [
    loadingRoomTypes,
    setLoadingRoomTypes,
  ] = useState(true);

  const [
    loadingRatePlans,
    setLoadingRatePlans,
  ] = useState(true);

  // =====================================================
  // Reservation Data
  // =====================================================

  const [
    bookingNumber,
    setBookingNumber,
  ] = useState("");

  const [hotelId, setHotelId] =
    useState("");

  const [guestName, setGuestName] =
    useState("");

  const [
    totalGuest,
    setTotalGuest,
  ] = useState("1");

  const [adultCount, setAdultCount] =
    useState("1");

  const [childCount, setChildCount] =
    useState("0");

  const [
    nationalityInput,
    setNationalityInput,
  ] = useState("");

  const [checkIn, setCheckIn] =
    useState("");

  const [checkOut, setCheckOut] =
    useState("");

  const [
    checkInInput,
    setCheckInInput,
  ] = useState("");

  const [
    checkOutInput,
    setCheckOutInput,
  ] = useState("");

  // =====================================================
  // Rooms
  // =====================================================

  const [rooms, setRooms] = useState<
    ReservationRoomForm[]
  >([createEmptyRoom()]);

  // =====================================================
  // Payment
  // =====================================================

  const [
    reservationType,
    setReservationType,
  ] = useState("booking_paid");

  const [
    exchangeRate,
    setExchangeRate,
  ] = useState("");

  // =====================================================
  // Other
  // =====================================================

  const [
    guestRequests,
    setGuestRequests,
  ] = useState("");

  // =====================================================
  // Saving
  // =====================================================

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  // =====================================================
  // Email Confirmation
  // =====================================================

  const [
    savedReservation,
    setSavedReservation,
  ] = useState<SavedReservation | null>(
    null
  );

  const [
    showEmailConfirmation,
    setShowEmailConfirmation,
  ] = useState(false);

  const [
    sendingEmail,
    setSendingEmail,
  ] = useState(false);

  const [
    emailMessage,
    setEmailMessage,
  ] = useState("");

  const [
    emailError,
    setEmailError,
  ] = useState("");

  // =====================================================
  // Load Hotels
  // =====================================================

  useEffect(() => {
    const loadHotels = async () => {
      try {
        setLoadingHotels(true);

        const data = await apiGet<Hotel[]>("/hotels");

setHotels(
          Array.isArray(data)
            ? data.filter(
                (hotel: Hotel) =>
                  hotel.is_active
              )
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

  // =====================================================
  // Load Room Types
  // =====================================================

  useEffect(() => {
    const loadRoomTypes =
      async () => {
        try {
          setLoadingRoomTypes(true);

          const data =
            await apiGet<RoomType[]>("/room-types");

setRoomTypes(
            Array.isArray(data)
              ? data.filter(
                  (room: RoomType) =>
                    room.is_active
                )
              : []
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "An error occurred while loading room types"
          );
        } finally {
          setLoadingRoomTypes(
            false
          );
        }
      };

    loadRoomTypes();
  }, []);

  // =====================================================
  // Load Rate Plans
  // =====================================================

  useEffect(() => {
    const loadRatePlans =
      async () => {
        try {
          setLoadingRatePlans(true);

          const data =
            await apiGet<RatePlan[]>("/rate-plans");

setRatePlans(
            Array.isArray(data)
              ? data.filter(
                  (rate: RatePlan) =>
                    rate.is_active
                )
              : []
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "An error occurred while loading rate plans"
          );
        } finally {
          setLoadingRatePlans(
            false
          );
        }
      };

    loadRatePlans();
  }, []);

  // =====================================================
  // Load Nationalities
  // =====================================================

  useEffect(() => {
    const loadNationalities = async () => {
      try {
        setLoadingNationalities(true);

        const data =
          await apiGet<Nationality[]>("/nationalities");

        setNationalities(
          Array.isArray(data)
            ? data.filter(
                (nationality: Nationality) =>
                  nationality.is_active
              )
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

  // =====================================================
  // Load Guest Count Options
  // =====================================================

  useEffect(() => {
    const loadGuestCountOptions = async () => {
      try {
        setLoadingGuestCounts(true);

        const data =
          await apiGet<GuestCountOption[]>(
            "/guest-count-options"
          );

        setGuestCountOptions(
          Array.isArray(data)
            ? data.filter(
                (option: GuestCountOption) =>
                  option.is_active
              )
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

  // =====================================================
  // Calculations
  // =====================================================

  const nights = useMemo(
    () =>
      calculateNights(
        checkIn,
        checkOut
      ),
    [checkIn, checkOut]
  );

  const isCash =
    reservationType.endsWith(
      "_cash"
    );

  const exchangeRateNumber =
    exchangeRate !== ""
      ? Number(exchangeRate)
      : null;

  const totalPriceUsd =
    useMemo(() => {
      return rooms.reduce(
        (total, room) => {
          const price = Number(
            room.total_price_usd
          );

          if (
            !Number.isFinite(price) ||
            price < 0
          ) {
            return total;
          }

          return total + price;
        },
        0
      );
    }, [rooms]);

  const totalPriceEgp =
    useMemo(() => {
      if (
        !isCash ||
        exchangeRateNumber === null ||
        !Number.isFinite(
          exchangeRateNumber
        ) ||
        exchangeRateNumber <= 0
      ) {
        return null;
      }

      return (
        totalPriceUsd *
        exchangeRateNumber
      );
    }, [
      isCash,
      totalPriceUsd,
      exchangeRateNumber,
    ]);

  const totalNightlyUsd =
    useMemo(() => {
      if (nights <= 0) return null;

      return (
        totalPriceUsd /
        nights
      );
    }, [
      totalPriceUsd,
      nights,
    ]);

  const totalNightlyEgp =
    useMemo(() => {
      if (
        totalNightlyUsd === null ||
        !isCash ||
        exchangeRateNumber === null ||
        !Number.isFinite(
          exchangeRateNumber
        ) ||
        exchangeRateNumber <= 0
      ) {
        return null;
      }

      return (
        totalNightlyUsd *
        exchangeRateNumber
      );
    }, [
      totalNightlyUsd,
      isCash,
      exchangeRateNumber,
    ]);

  const normalizedNationalitySearch =
    nationalityInput.trim().toLowerCase();

  const filteredNationalities =
    normalizedNationalitySearch
      ? nationalities.filter(
          (nationality) =>
            nationality.code
              .toLowerCase()
              .includes(
                normalizedNationalitySearch
              ) ||
            nationality.name
              .toLowerCase()
              .includes(
                normalizedNationalitySearch
              )
        )
      : nationalities;

  const selectedNationality =
    nationalities.find(
      (nationality) =>
        nationality.code.toLowerCase() ===
        normalizedNationalitySearch ||
        nationality.name.toLowerCase() ===
        normalizedNationalitySearch
    ) || null;

  const nationalityCode =
    selectedNationality?.code ||
    nationalityInput.trim().toUpperCase();

  const nationalityName =
    selectedNationality?.name || "";

  const filteredGuestCounts =
    guestCountSearch.trim()
      ? guestCountOptions.filter(
          (option) =>
            option.code
              .toLowerCase()
              .includes(
                guestCountSearch.trim().toLowerCase()
              ) ||
            option.label
              .toLowerCase()
              .includes(
                guestCountSearch.trim().toLowerCase()
              ) ||
            String(option.adults).includes(
              guestCountSearch.trim()
            )
        )
      : guestCountOptions;

  const selectedGuestCount =
    guestCountOptions.find(
      (option) =>
        selectedGuestCountId === String(option.id)
    ) || null;

  const selectedRoomSearchValues =
    roomTypeSearchByIndex;

  const selectedHotel =
    hotels.find(
      (hotel) =>
        hotel.id === Number(hotelId)
    ) || null;

  // =====================================================
  // Date Handlers
  // =====================================================

  const handleCheckInBlur =
    () => {
      if (!checkInInput.trim()) {
        setCheckIn("");
        return;
      }

      const parsed =
        parseFlexibleDate(
          checkInInput
        );

      if (parsed) {
        setCheckIn(parsed);

        setCheckInInput(
          displayDate(parsed)
        );
      }
    };

  const handleCheckOutBlur =
    () => {
      if (!checkOutInput.trim()) {
        setCheckOut("");
        return;
      }

      const parsed =
        parseFlexibleDate(
          checkOutInput
        );

      if (parsed) {
        setCheckOut(parsed);

        setCheckOutInput(
          displayDate(parsed)
        );
      }
    };

  // =====================================================
  // Room Count
  // =====================================================

  const handleRoomCountChange = (
    value: string
  ) => {
    setError("");

    if (value === "") {
      setRooms([]);
      return;
    }

    const count = Math.max(
      1,
      Number(value)
    );

    if (!Number.isFinite(count)) {
      return;
    }

    setRooms(
      (currentRooms) => {
        const updated = [
          ...currentRooms,
        ];

        while (
          updated.length < count
        ) {
          updated.push(
            createEmptyRoom()
          );
        }

        while (
          updated.length > count
        ) {
          updated.pop();
        }

        return updated;
      }
    );
  };

  // =====================================================
  // Room Update
  // =====================================================

  const updateRoom = (
    index: number,
    field: keyof ReservationRoomForm,
    value: string
  ) => {
    setRooms(
      (currentRooms) =>
        currentRooms.map(
          (
            room,
            roomIndex
          ) =>
            roomIndex === index
              ? {
                  ...room,
                  [field]: value,
                }
              : room
        )
    );
  };

  // =====================================================
  // Submit Reservation
  // =====================================================

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setMessage("");
    setError("");

    setEmailMessage("");
    setEmailError("");

    // ---------------------------------------------------
    // Booking
    // ---------------------------------------------------

    if (!bookingNumber.trim()) {
      setError(
        "Please enter the booking number"
      );
      return;
    }

    if (!hotelId) {
      setError(
        "Please select a hotel"
      );
      return;
    }

    if (!guestName.trim()) {
      setError(
        "Please enter the guest name"
      );
      return;
    }

    // ---------------------------------------------------
    // Guests
    // ---------------------------------------------------

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

    // ---------------------------------------------------
    // Dates
    // ---------------------------------------------------

    if (!checkIn || !checkOut) {
      setError(
        "Please enter check-in and check-out dates"
      );
      return;
    }

    if (nights <= 0) {
      setError(
        "Check-out date must be after check-in date"
      );
      return;
    }

    // ---------------------------------------------------
    // Nationality
    // ---------------------------------------------------

    if (
      nationalityInput.trim() &&
      !selectedNationality
    ) {
      setError(
        `Nationality "${nationalityInput.trim()}" was not found.`
      );
      return;
    }

    // ---------------------------------------------------
    // Rooms
    // ---------------------------------------------------

    if (!rooms.length) {
      setError(
        "At least one room is required"
      );
      return;
    }

    for (
      let index = 0;
      index < rooms.length;
      index++
    ) {
      const room =
        rooms[index];

      if (!room.room_type_id) {
        setError(
          `Please select room type number ${
            index + 1
          }`
        );
        return;
      }

      if (!room.rate_plan_id) {
        setError(
          `Please select a Rate Plan for room ${
            index + 1
          }`
        );
        return;
      }

      const roomPrice =
        Number(
          room.total_price_usd
        );

      if (
        room.total_price_usd ===
          "" ||
        !Number.isFinite(
          roomPrice
        ) ||
        roomPrice < 0
      ) {
        setError(
          `Please enter the price for room ${
            index + 1
          } in USD`
        );
        return;
      }
    }

    // ---------------------------------------------------
    // Cash
    // ---------------------------------------------------

    if (isCash) {
      if (
        exchangeRateNumber === null ||
        !Number.isFinite(
          exchangeRateNumber
        ) ||
        exchangeRateNumber <= 0
      ) {
        setError(
          "Please enter the cash exchange rate"
        );
        return;
      }
    }

    // ---------------------------------------------------
    // Save
    // ---------------------------------------------------

    try {
      setSaving(true);

      const createdBy =
        getCurrentUserName();

      const data = await apiPost<{
        success: boolean;
        message: string;
        reservation: SavedReservation;
      }>("/reservations", {
        booking_number:
          bookingNumber.trim(),

        hotel_id:
          Number(hotelId),

        guest_name:
          guestName.trim() ||
          null,

        total_guest:
          totalGuestNumber,

        adult_count:
          adultCountNumber,

        child_count:
          childCountNumber,

        nationality:
          nationalityCode ||
          null,

        check_in:
          checkIn,

        check_out:
          checkOut,

        payment_type:
          reservationType,

        rooms:
          rooms.map(
            (room) => ({
              room_type_id:
                Number(
                  room.room_type_id
                ),

              rate_plan_id:
                Number(
                  room.rate_plan_id
                ),

              total_price_usd:
                Number(
                  room.total_price_usd
                ),
            })
          ),

        exchange_rate:
          isCash
            ? exchangeRateNumber
            : null,

        guest_requests:
          guestRequests.trim() ||
          null,

        created_by:
          createdBy,
      });

const reservation =
        data.reservation as SavedReservation;

      setSavedReservation(
        reservation
      );

      setMessage(
        `Reservation ${reservation.booking_number} created successfully`
      );

      // -------------------------------------------------
      // Show Email Confirmation
      // -------------------------------------------------

      setEmailMessage("");
      setEmailError("");

      setShowEmailConfirmation(
        true
      );
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

  // =====================================================
  // Send Email
  // =====================================================

  const handleSendEmail =
    async () => {
      if (!savedReservation) {
        return;
      }

      setSendingEmail(true);

      setEmailMessage("");
      setEmailError("");

      try {
        const createdBy =
          getCurrentUserName();

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
            sent_by:
              createdBy,
          }
        );

setEmailMessage(
          `Reservation sent successfully to ${data.email}`
        );

        setSavedReservation(
          (current) =>
            current
              ? {
                  ...current,
                  email_status:
                    "sent",
                  email_sent_at:
                    data.email_sent_at,
                  email_error:
                    null,
                }
              : current
        );

        // After successful sending, hide the modal
        // after a short delay so the user can see the message
        setTimeout(() => {
          setShowEmailConfirmation(
            false
          );
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

  // =====================================================
  // Don't Send Email
  // =====================================================

  const handleSkipEmail = () => {
    setShowEmailConfirmation(
      false
    );

    setEmailMessage("");

    setEmailError("");

    // -------------------------------------------------
    // Reset Form
    // -------------------------------------------------

    resetForm();
  };

  // =====================================================
  // Reset Form
  // =====================================================

  const resetForm = () => {
    setBookingNumber("");

    setHotelId("");

    setGuestName("");

    setTotalGuest("1");
    setAdultCount("1");
    setChildCount("0");
    setGuestCountSearch("");
    setSelectedGuestCountId("");

    setNationalityInput("");

    setCheckIn("");

    setCheckOut("");

    setCheckInInput("");

    setCheckOutInput("");

    setRooms([
      createEmptyRoom(),
    ]);

    setReservationType(
      "booking_paid"
    );

    setExchangeRate("");

    setGuestRequests("");

    setSavedReservation(
      null
    );
  };

  // =====================================================
  // UI
  // =====================================================

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0b1220] text-white"
    >
      {/* =================================================
          Header
      ================================================= */}

      <header className="border-b border-slate-800 bg-[#0f172a]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold">
              New Reservation
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Create a New Reservation in the system
            </p>
          </div>

          <Link
            href="/reservations"
            className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-medium transition hover:bg-slate-700"
          >
            Back to Reservations
          </Link>
        </div>
      </header>

      {/* =================================================
          Content
      ================================================= */}

      <section className="mx-auto max-w-6xl px-6 py-8">
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* =================================================
              Reservation Information
          ================================================= */}

          <div className="rounded-2xl border border-slate-800 bg-[#111827] p-6">
            <h2 className="mb-6 border-b border-slate-800 pb-4 text-lg font-bold">
              📋 Reservation Information
            </h2>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Booking Number */}

              <Field label="Booking Number *">
                <input
                  type="text"
                  value={
                    bookingNumber
                  }
                  onChange={(e) =>
                    setBookingNumber(
                      e.target.value
                    )
                  }
                  placeholder="Example: TEST-1004"
                  className={
                    inputClass
                  }
                />
              </Field>

              {/* Hotel */}

              <Field
                label="Hotel *"
                hint={
                  selectedHotel?.email
                    ? `✉ ${selectedHotel.email}`
                    : undefined
                }
              >
                <select
                  value={hotelId}
                  onChange={(e) =>
                    setHotelId(
                      e.target.value
                    )
                  }
                  disabled={
                    loadingHotels
                  }
                  className={
                    inputClass
                  }
                >
                  <option value=""
                        className="bg-white text-slate-900"
                      >
                    {loadingHotels
                      ? "Loading hotels..."
                      : "Select hotel"}
                  </option>

                  {hotels.map(
                    (hotel) => (
                      <option
                        key={
                          hotel.id
                        }
                        value={
                          hotel.id
                        }
                      
                        className="bg-white text-slate-900"
                      >
                        {
                          hotel.name
                        }
                      </option>
                    )
                  )}
                </select>

                {selectedHotel &&
                  !selectedHotel.email && (
                    <p className="mt-2 text-xs text-amber-400">
                      ⚠️ This hotel has no registered email address
                    </p>
                  )}
              </Field>

              {/* Guest */}

              <Field label="Guest Name *">
                <input
                  type="text"
                  value={
                    guestName
                  }
                  onChange={(e) =>
                    setGuestName(
                      e.target.value
                    )
                  }
                  placeholder="Guest Name"
                  className={
                    inputClass
                  }
                />
              </Field>

              {/* Guests */}

              <Field
                label="Guests"
                hint="Select a composition or enter adults/children separately"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={guestCountSearch}
                    onChange={(e) =>
                      setGuestCountSearch(e.target.value)
                    }
                    placeholder="Search (e.g. 3A, 3 Adults, 3A1C)"
                    className={inputClass}
                    disabled={loadingGuestCounts}
                  />

                  {guestCountSearch.trim() &&
                    filteredGuestCounts.length > 0 && (
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1220]">
                        {filteredGuestCounts
                          .slice(0, 20)
                          .map((option) => (
                            <button
                              type="button"
                              key={option.id}
                              onClick={() => {
                                setSelectedGuestCountId(String(option.id));
                                setGuestCountSearch(
                                  `${option.code} — ${option.label}`
                                );
                                setAdultCount(String(option.adults));
                                setChildCount(String(option.children));
                                setTotalGuest(String(option.adults));
                              }}
                              className="block w-full px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                            >
                              <span className="font-semibold text-blue-300">
                                {option.code}
                              </span>
                              <span className="ml-2">
                                {option.label}
                              </span>
                            </button>
                          ))}
                      </div>
                    )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-medium text-slate-400">
                        Adults
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={adultCount}
                        onChange={(e) => {
                          setAdultCount(e.target.value);
                          setTotalGuest(e.target.value);
                          setSelectedGuestCountId("");
                        }}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-medium text-slate-400">
                        Children
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={childCount}
                        onChange={(e) => {
                          setChildCount(e.target.value);
                          setSelectedGuestCountId("");
                        }}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm">
                    <span className="text-slate-400">Displayed as: </span>
                    <span className="font-bold text-blue-300">
                      {Number(adultCount || 0) > 0
                        ? `${adultCount} Adult${Number(adultCount || 0) === 1 ? "" : "s"}`
                        : ""}
                      {Number(childCount || 0) > 0
                        ? `${Number(adultCount || 0) > 0 ? " + " : ""}${childCount} Child${Number(childCount || 0) === 1 ? "" : "ren"}`
                        : Number(adultCount || 0) === 0
                          ? "0"
                          : ""}
                    </span>
                  </div>
                </div>
              </Field>

              {/* Nationality */}

              <Field
                label="Nationality"
                hint={
                  nationalityName
                    ? `✓ ${nationalityName}`
                    : "Search by code or country name"
                }
              >
                <div className="space-y-2">
                  <input
                    type="text"
                    value={nationalityInput}
                    onChange={(e) =>
                      setNationalityInput(
                        e.target.value
                      )
                    }
                    placeholder="EG or Egypt"
                    className={`${inputClass} uppercase`}
                    disabled={loadingNationalities}
                  />

                  {nationalityInput.trim() &&
                    filteredNationalities.length > 0 && (
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1220]">
                        {filteredNationalities
                          .slice(0, 20)
                          .map((nationality) => (
                            <button
                              type="button"
                              key={nationality.id}
                              onClick={() => {
                                setNationalityInput(
                                  nationality.code
                                );
                              }}
                              className="block w-full px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                            >
                              <span className="font-semibold text-blue-300">
                                {nationality.code}
                              </span>
                              <span className="ml-2">
                                {nationality.name}
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                </div>
              </Field>

              {/* Payment */}

              <Field label="Booking / Payment Type *">
                <select
                  value={
                    reservationType
                  }
                  onChange={(e) =>
                    setReservationType(
                      e.target.value
                    )
                  }
                  className={
                    inputClass
                  }
                >
                  {PAYMENT_TYPES.map(
                    (
                      payment
                    ) => (
                      <option
                        key={
                          payment.value
                        }
                        value={
                          payment.value
                        }
                      
                        className="bg-white text-slate-900"
                      >
                        {
                          payment.label
                        }
                      </option>
                    )
                  )}
                </select>
              </Field>
            </div>
          </div>

          {/* =================================================
              Stay
          ================================================= */}

          <div className="rounded-2xl border border-slate-800 bg-[#111827] p-6">
            <h2 className="mb-6 border-b border-slate-800 pb-4 text-lg font-bold">
              📅 Stay Information
            </h2>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Check In */}

              <Field
                label="Check-in"
                hint="Example: 8/8/26"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={
                      checkInInput
                    }
                    onChange={(e) =>
                      setCheckInInput(
                        e.target.value
                      )
                    }
                    onBlur={
                      handleCheckInBlur
                    }
                    placeholder="08/08/26"
                    className={`${inputClass} pl-12`}
                  />

                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg">
                    📅
                  </span>
                </div>
              </Field>

              {/* Check Out */}

              <Field
                label="Check-out"
                hint="Example: 12/8/26"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={
                      checkOutInput
                    }
                    onChange={(e) =>
                      setCheckOutInput(
                        e.target.value
                      )
                    }
                    onBlur={
                      handleCheckOutBlur
                    }
                    placeholder="12/08/26"
                    className={`${inputClass} pl-12`}
                  />

                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg">
                    📅
                  </span>
                </div>
              </Field>
            </div>

            {nights > 0 && (
              <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">
                    Nights
                  </span>

                  <span className="text-lg font-bold text-blue-300">
                    {nights} Night
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* =================================================
              Rooms
          ================================================= */}

          <div className="rounded-2xl border border-slate-800 bg-[#111827] p-6">
            <div className="mb-6 flex flex-col gap-2 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  🛏️ Room Information
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Each room has its own room type, rate plan, and price
                </p>
              </div>

              <div className="rounded-full bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300">
                {rooms.length}{" "}
                {rooms.length === 1
                  ? "Room"
                  : "Rooms"}
              </div>
            </div>

            <Field label="Number of Rooms *">
              <input
                type="number"
                min="1"
                max="50"
                value={
                  rooms.length
                }
                onChange={(e) =>
                  handleRoomCountChange(
                    e.target.value
                  )
                }
                className={
                  inputClass
                }
              />
            </Field>

            <div className="mt-6 space-y-5">
              {rooms.map(
                (
                  room,
                  index
                ) => {
                  const roomPrice =
                    room.total_price_usd !==
                    ""
                      ? Number(
                          room.total_price_usd
                        )
                      : null;

                  const roomNightlyUsd =
                    roomPrice !==
                      null &&
                    Number.isFinite(
                      roomPrice
                    ) &&
                    nights > 0
                      ? roomPrice /
                        nights
                      : null;

                  const roomTotalEgp =
                    isCash &&
                    roomPrice !==
                      null &&
                    Number.isFinite(
                      roomPrice
                    ) &&
                    exchangeRateNumber !==
                      null &&
                    Number.isFinite(
                      exchangeRateNumber
                    ) &&
                    exchangeRateNumber >
                      0
                      ? roomPrice *
                        exchangeRateNumber
                      : null;

                  const roomNightlyEgp =
                    isCash &&
                    roomNightlyUsd !==
                      null &&
                    exchangeRateNumber !==
                      null &&
                    Number.isFinite(
                      exchangeRateNumber
                    ) &&
                    exchangeRateNumber >
                      0
                      ? roomNightlyUsd *
                        exchangeRateNumber
                      : null;

                  return (
                    <div
                      key={
                        index
                      }
                      className="rounded-2xl border border-slate-700 bg-[#0b1220] p-5"
                    >
                      <div className="mb-5 flex items-center justify-between">
                        <h3 className="text-base font-bold text-blue-300">
                          Room{" "}
                          {index +
                            1}
                        </h3>

                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                          {nights >
                          0
                            ? `${nights} Night`
                            : "Select dates"}
                        </span>
                      </div>

                      <div className="grid gap-5 md:grid-cols-2">
                        {/* Room Type */}

                        <Field
                          label="Room Type *"
                          hint="Search by name or abbreviation"
                        >
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={
                                (() => {
                                  const selected =
                                    roomTypes.find(
                                      (type) =>
                                        String(type.id) ===
                                        room.room_type_id
                                    );

                                  if (selected) {
                                    return selected.code
                                      ? `${selected.code} — ${selected.name}`
                                      : selected.name;
                                  }

                                  return (
                                    selectedRoomSearchValues[
                                      index
                                    ] || ""
                                  );
                                })()
                              }
                              onChange={(e) => {
                                setRoomTypeSearchByIndex(
                                  (current) => ({
                                    ...current,
                                    [index]:
                                      e.target.value,
                                  })
                                );
                              }}
                              placeholder={
                                loadingRoomTypes
                                  ? "Loading room types..."
                                  : "Search room..."
                              }
                              className={inputClass}
                              disabled={loadingRoomTypes}
                            />

                            {(
                              selectedRoomSearchValues[
                                index
                              ] || ""
                            ).trim() &&
                              roomTypes.filter(
                                (type) =>
                                  type.name
                                    .toLowerCase()
                                    .includes(
                                      (
                                        selectedRoomSearchValues[
                                          index
                                        ] || ""
                                      )
                                        .trim()
                                        .toLowerCase()
                                    ) ||
                                  (type.code || "")
                                    .toLowerCase()
                                    .includes(
                                      (
                                        selectedRoomSearchValues[
                                          index
                                        ] || ""
                                      )
                                        .trim()
                                        .toLowerCase()
                                    )
                              ).length > 0 && (
                                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1220]">
                                  {roomTypes
                                    .filter(
                                      (type) =>
                                        type.name
                                          .toLowerCase()
                                          .includes(
                                            (
                                              selectedRoomSearchValues[
                                                index
                                              ] || ""
                                            )
                                              .trim()
                                              .toLowerCase()
                                          ) ||
                                        (type.code || "")
                                          .toLowerCase()
                                          .includes(
                                            (
                                              selectedRoomSearchValues[
                                                index
                                              ] || ""
                                            )
                                              .trim()
                                              .toLowerCase()
                                          )
                                    )
                                    .slice(0, 20)
                                    .map((type) => (
                                      <button
                                        type="button"
                                        key={type.id}
                                        onClick={() => {
                                          updateRoom(
                                            index,
                                            "room_type_id",
                                            String(
                                              type.id
                                            )
                                          );

                                          setRoomTypeSearchByIndex(
                                            (current) => ({
                                              ...current,
                                              [index]:
                                                "",
                                            })
                                          );
                                        }}
                                        className="block w-full px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                                      >
                                        <span className="font-semibold text-blue-300">
                                          {type.code ||
                                            "-"}
                                        </span>
                                        <span className="ml-2">
                                          {type.name}
                                        </span>
                                      </button>
                                    ))}
                                </div>
                              )}
                          </div>
                        </Field>

                        {/* Rate Plan */}

                        <Field
                          label="Rate Plan *"
                          hint="Meal plan"
                        >
                          <select
                            value={
                              room.rate_plan_id
                            }
                            onChange={(
                              e
                            ) =>
                              updateRoom(
                                index,
                                "rate_plan_id",
                                e.target
                                  .value
                              )
                            }
                            disabled={
                              loadingRatePlans
                            }
                            className={
                              inputClass
                            }
                          >
                            <option value=""
                        className="bg-white text-slate-900"
                      >
                              {loadingRatePlans
                                ? "Loading rate plans..."
                                : "Select Rate Plan"}
                            </option>

                            {ratePlans.map(
                              (
                                rate
                              ) => (
                                <option
                                  key={
                                    rate.id
                                  }
                                  value={
                                    rate.id
                                  }
                                
                        className="bg-white text-slate-900"
                      >
                                  {
                                    rate.code
                                  }{" "}
                                  —{" "}
                                  {
                                    rate.name
                                  }
                                  {rate.meals
                                    ? ` — ${rate.meals}`
                                    : ""}
                                </option>
                              )
                            )}
                          </select>
                        </Field>

                        {/* Total Room Price */}

                        <Field
                          label="Total Room Price *"
                          hint="USD"
                        >
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                room.total_price_usd
                              }
                              onChange={(
                                e
                              ) =>
                                updateRoom(
                                  index,
                                  "total_price_usd",
                                  e.target
                                    .value
                                )
                              }
                              placeholder="100.00"
                              className={`${inputClass} pl-14`}
                            />

                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                              USD
                            </span>
                          </div>
                        </Field>

                        {/* Nightly */}

                        <Field
                          label="Nightly Rate"
                          hint="Calculated automatically"
                        >
                          <div className="flex min-h-[50px] items-center rounded-xl border border-slate-700 bg-[#111827] px-4">
                            <span className="font-bold text-emerald-400">
                              {roomNightlyUsd !==
                              null
                                ? `${formatNumber(
                                    roomNightlyUsd
                                  )} USD`
                                : "-"}
                            </span>
                          </div>
                        </Field>
                      </div>

                      {/* Cash Room Details */}

                      {isCash && (
                        <div className="mt-5 grid gap-4 border-t border-slate-800 pt-5 md:grid-cols-2">
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                            <p className="text-xs text-slate-500">
                              Total Room in L.E
                            </p>

                            <p className="mt-2 font-bold text-amber-300">
                              {roomTotalEgp !==
                              null
                                ? `${formatNumber(
                                    roomTotalEgp
                                  )} EGP`
                                : "-"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                            <p className="text-xs text-slate-500">
                              Nightly Rate in L.E
                            </p>

                            <p className="mt-2 font-bold text-amber-300">
                              {roomNightlyEgp !==
                              null
                                ? `${formatNumber(
                                    roomNightlyEgp
                                  )} EGP`
                                : "-"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {/* =================================================
              Financial
          ================================================= */}

          <div className="rounded-2xl border border-slate-800 bg-[#111827] p-6">
            <div className="mb-6 flex flex-col gap-2 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold">
                💰 Financial Information
              </h2>

              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                Base Currency: USD
              </span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Total Reservation USD"
                hint="Calculated from rooms"
              >
                <div className="flex min-h-[50px] items-center rounded-xl border border-slate-700 bg-[#0b1220] px-4">
                  <span className="text-lg font-bold text-emerald-400">
                    {formatNumber(
                      totalPriceUsd
                    )}{" "}
                    USD
                  </span>
                </div>
              </Field>

              <Field
                label="Total Nightly Price"
                hint="All rooms"
              >
                <div className="flex min-h-[50px] items-center rounded-xl border border-slate-700 bg-[#0b1220] px-4">
                  <span className="text-lg font-bold text-emerald-400">
                    {totalNightlyUsd !==
                    null
                      ? `${formatNumber(
                          totalNightlyUsd
                        )} USD`
                      : "-"}
                  </span>
                </div>
              </Field>
            </div>

            {isCash && (
              <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                <div className="mb-5">
                  <h3 className="text-base font-bold text-amber-300">
                    💵 Cash Information
                  </h3>

                  <p className="mt-1 text-xs text-slate-400">
                    The exchange rate used at reservation creation will be saved.
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                  <Field label="Exchange Rate">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={
                          exchangeRate
                        }
                        onChange={(e) =>
                          setExchangeRate(
                            e.target.value
                          )
                        }
                        placeholder="51.0000"
                        className={`${inputClass} pl-12`}
                      />

                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                        EGP
                      </span>
                    </div>
                  </Field>

                  <Field label="Total in L.E">
                    <div className="flex min-h-[50px] items-center rounded-xl border border-slate-700 bg-[#0b1220] px-4">
                      <span className="text-lg font-bold text-amber-300">
                        {totalPriceEgp !==
                        null
                          ? `${formatNumber(
                              totalPriceEgp
                            )} EGP`
                          : "-"}
                      </span>
                    </div>
                  </Field>

                  <Field label="Total Nightly Price in L.E">
                    <div className="flex min-h-[50px] items-center rounded-xl border border-slate-700 bg-[#0b1220] px-4">
                      <span className="text-lg font-bold text-amber-300">
                        {totalNightlyEgp !==
                        null
                          ? `${formatNumber(
                              totalNightlyEgp
                            )} EGP`
                          : "-"}
                      </span>
                    </div>
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* =================================================
              Guest Requests
          ================================================= */}

          <div className="rounded-2xl border border-slate-800 bg-[#111827] p-6">
            <h2 className="mb-6 border-b border-slate-800 pb-4 text-lg font-bold">
              📝 Guest Requests
            </h2>

            <textarea
              value={
                guestRequests
              }
              onChange={(e) =>
                setGuestRequests(
                  e.target.value
                )
              }
              rows={4}
              placeholder="Example: Late check-in..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* =================================================
              Summary
          ================================================= */}

          <div className="rounded-2xl border border-slate-800 bg-[#111827] p-6">
            <h2 className="mb-5 text-lg font-bold">
              📊 Reservation Summary
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryItem
                label="Nights"
                value={
                  nights > 0
                    ? `${nights} Night`
                    : "-"
                }
              />

              <SummaryItem
                label="Rooms"
                value={String(
                  rooms.length
                )}
              />

              <SummaryItem
                label="Total USD"
                value={`${formatNumber(
                  totalPriceUsd
                )} USD`}
              />

              <SummaryItem
                label="Nightly Rate USD"
                value={
                  totalNightlyUsd !==
                  null
                    ? `${formatNumber(
                        totalNightlyUsd
                      )} USD`
                    : "-"
                }
              />

              <SummaryItem
                label="Payment Type"
                value={
                  PAYMENT_TYPES.find(
                    (payment) =>
                      payment.value ===
                      reservationType
                  )?.label ||
                  "-"
                }
              />
            </div>

            {isCash && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SummaryItem
                  label="Total L.E"
                  value={
                    totalPriceEgp !==
                    null
                      ? `${formatNumber(
                          totalPriceEgp
                        )} EGP`
                      : "-"
                  }
                />

                <SummaryItem
                  label="Nightly Rate L.E"
                  value={
                    totalNightlyEgp !==
                    null
                      ? `${formatNumber(
                          totalNightlyEgp
                        )} EGP`
                      : "-"
                  }
                />
              </div>
            )}
          </div>

          {/* =================================================
              Messages
          ================================================= */}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-300">
              {message}
            </div>
          )}

          {/* =================================================
              Actions
          ================================================= */}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/reservations"
              className="rounded-xl border border-slate-700 bg-slate-800 px-7 py-3 text-center font-semibold transition hover:bg-slate-700"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={
                saving ||
                loadingHotels ||
                loadingRoomTypes ||
                loadingRatePlans ||
                loadingNationalities ||
                loadingGuestCounts
              }
              className="rounded-xl bg-blue-600 px-7 py-3 font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Saving reservation..."
                : "Save Reservation"}
            </button>
          </div>
        </form>
      </section>

      {/* =====================================================
          Email Confirmation Modal
      ===================================================== */}

      {showEmailConfirmation &&
        savedReservation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-3xl border border-slate-700 bg-[#111827] p-6 shadow-2xl">
              {/* Header */}

              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl">
                  ✉️
                </div>

                <div>
                  <h2 className="text-xl font-bold">
                    Send Reservation to Hotel
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    Reservation saved successfully. Would you like to send it to the hotel now?
                  </p>
                </div>
              </div>

              {/* Quick Preview */}

              <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
                <div className="mb-4 grid gap-3 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-slate-500">Booking Number</div>
                    <div className="mt-1 font-bold text-white">
                      {savedReservation.booking_number}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Hotel</div>
                    <div className="mt-1 font-bold text-blue-300">
                      {savedReservation.hotel?.name || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Guest</div>
                    <div className="mt-1 font-semibold text-slate-200">
                      {savedReservation.guest_name || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Guests</div>
                    <div className="mt-1 font-semibold text-blue-300">
                      {savedReservation.guest_count_label ||
                        (savedReservation.adult_count != null
                          ? `${savedReservation.adult_count} Adult${savedReservation.adult_count === 1 ? "" : "s"}${savedReservation.child_count ? ` + ${savedReservation.child_count} Child${savedReservation.child_count === 1 ? "" : "ren"}` : ""}`
                          : savedReservation.total_guest ?? "-")}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full min-w-[950px] text-sm">
                    <thead className="bg-slate-800/60 text-slate-300">
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
                            <tr key={index} className="border-t border-slate-800">
                              <td className="px-4 py-3 font-semibold text-blue-300">{index + 1}</td>
                              <td className="px-4 py-3">{room.room_type || "-"}</td>
                              <td className="px-4 py-3">
                                <div className="font-semibold">{room.rate_plan_code || "-"}</div>
                                <div className="text-xs text-slate-500">{room.rate_plan_name || "-"}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-300">{room.meals || "-"}</td>
                              <td className="px-4 py-3 font-semibold text-emerald-300">
                                USD {formatNumber(room.nightly_rate_usd ?? null)}
                                {hasEgp && <div className="text-xs font-semibold text-amber-300">EGP {formatNumber(room.nightly_rate_egp ?? null)}</div>}
                              </td>
                              <td className="px-4 py-3 font-semibold text-emerald-300">
                                USD {formatNumber(room.total_price_usd ?? null)}
                                {hasEgp && <div className="text-xs font-semibold text-amber-300">EGP {formatNumber(room.total_price_egp ?? null)}</div>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 p-3">
                    <div className="text-xs text-slate-500">Check-in</div>
                    <div className="mt-1 font-semibold">{savedReservation.check_in || "-"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 p-3">
                    <div className="text-xs text-slate-500">Check-out</div>
                    <div className="mt-1 font-semibold">{savedReservation.check_out || "-"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 p-3">
                    <div className="text-xs text-slate-500">Payment</div>
                    <div className="mt-1 font-semibold">{savedReservation.payment_label || savedReservation.payment_type || "-"}</div>
                  </div>
                </div>

                {savedReservation.guest_requests && (
                  <div className="mt-4 rounded-xl border border-slate-800 p-3">
                    <div className="text-xs text-slate-500">Guest Requests</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{savedReservation.guest_requests}</div>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-1 border-t border-slate-800 pt-4 text-right">
                  <div className="text-lg font-black text-emerald-300">USD {formatNumber(savedReservation.total_price_usd ?? 0)}</div>
                  {savedReservation.total_price_egp != null && (
                    <div className="font-semibold text-amber-300">EGP {formatNumber(savedReservation.total_price_egp)}</div>
                  )}
                </div>
              </div>

              {/* Email Result */}

              {emailMessage && (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  ✅ {emailMessage}
                </div>
              )}

              {emailError && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  ❌ {emailError}
                </div>
              )}

              {/* Actions */}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={
                    handleSkipEmail
                  }
                  disabled={
                    sendingEmail
                  }
                  className="rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 font-semibold transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  No, later
                </button>

                <button
                  type="button"
                  onClick={
                    handleSendEmail
                  }
                  disabled={
                    sendingEmail ||
                    !savedReservation
                      .hotel?.email
                  }
                  className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendingEmail
                    ? "Sending reservation..."
                    : "Send Reservation by Email"}
                </button>
              </div>

              {!savedReservation
                .hotel?.email && (
                <p className="mt-4 text-center text-xs text-slate-500">
                  Add a hotel email in Hotel Information first, then you can send the reservation.
                </p>
              )}
            </div>
          </div>
        )}
    </main>
  );
}

// =========================================================
// Reusable Components
// =========================================================

const inputClass =
  "w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-slate-300">
          {label}
        </label>

        {hint && (
          <span className="text-xs text-slate-500">
            {hint}
          </span>
        )}
      </div>

      {children}
    </div>
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
    <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4">
      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p className="mt-2 font-bold text-slate-100">
        {value}
      </p>
    </div>
  );
}