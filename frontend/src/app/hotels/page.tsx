"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { API_BASE_URL, apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

type Hotel = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  attachments?: HotelAttachment[];
};

type HotelAttachment = {
  id: number;
  hotel_id: number;
  original_name: string;
  stored_name: string;
  content_type: string;
  file_size: number;
  is_image: boolean;
  is_pdf: boolean;
  url: string;
  created_at?: string | null;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
};

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default function HotelsPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const [editingHotelId, setEditingHotelId] = useState<number | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  const [hotelActionId, setHotelActionId] = useState<number | null>(null);

  const loadHotels = useCallback(async () => {
    try {
      setLoading(true);
      setMessage(null);

      const data = await apiGet<Hotel[]>("/hotels");

      if (!Array.isArray(data)) {
        throw new Error("Invalid hotels response from the backend.");
      }

      setHotels(data);
    } catch (error) {
      setHotels([]);

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while loading hotels.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHotels();
  }, [loadHotels]);

  function updateField(
    field: keyof typeof emptyForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }


  function beginAddHotel() {
    setEditingHotelId(null);
    setSelectedHotelId(null);
    setForm(emptyForm);
    setSelectedFiles([]);
    setShowForm(true);
    setMessage(null);
  }

  function beginEditHotel(hotel: Hotel) {
    setEditingHotelId(hotel.id);
    setForm({
      name: hotel.name || "",
      email: hotel.email || "",
      phone: hotel.phone || "",
      address: hotel.address || "",
    });
    setSelectedFiles([]);
    setShowForm(true);
    setSelectedHotelId(hotel.id);
    setMessage(null);
  }

  function cancelHotelForm() {
    if (saving || uploadingFiles) {
      return;
    }

    setEditingHotelId(null);
    setSelectedHotelId(null);
    setForm(emptyForm);
    setSelectedFiles([]);
    setShowForm(false);
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);

    // Accept common image types plus PDF as requested.
    const validFiles = files.filter((file) => {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      return isImage || isPdf;
    });

    setSelectedFiles(validFiles);

    if (validFiles.length !== files.length) {
      setMessage({
        type: "error",
        text: "Only image files and PDF documents can be uploaded.",
      });
    } else {
      setMessage(null);
    }
  }

  async function uploadHotelFiles(hotelId: number, files: File[]) {
    if (!files.length) {
      return;
    }

    try {
      setUploadingFiles(true);

      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });

      await apiPost(
        `/hotels/${hotelId}/attachments`,
        formData
      );

      setMessage({
        type: "success",
        text: "Hotel files uploaded successfully.",
      });

      await loadHotels();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while uploading hotel files.",
      });
    } finally {
      setUploadingFiles(false);
    }
  }

  async function deleteHotelAttachment(
    hotelId: number,
    attachmentId: number
  ) {
    try {
      setDeletingAttachmentId(attachmentId);

      await apiDelete(
        `/hotels/${hotelId}/attachments/${attachmentId}`
      );

      setMessage({
        type: "success",
        text: "Hotel file deleted successfully.",
      });

      await loadHotels();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while deleting the hotel file.",
      });
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  function formatFileSize(size?: number | null) {
    if (!size || size <= 0) {
      return "-";
    }

    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function toggleHotelStatus(hotel: Hotel) {
    try {
      setHotelActionId(hotel.id);
      setMessage(null);

      await apiPatch(`/hotels/${hotel.id}`, {
        is_active: !hotel.is_active,
      });

      setMessage({
        type: "success",
        text: hotel.is_active
          ? `"${hotel.name}" was deactivated successfully.`
          : `"${hotel.name}" was activated successfully.`,
      });

      await loadHotels();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while changing hotel status.",
      });
    } finally {
      setHotelActionId(null);
    }
  }

  async function deleteHotel(hotel: Hotel) {
    const confirmed = window.confirm(
      `Delete "${hotel.name}" permanently?\n\nIf this hotel is linked to reservations, the server should block the deletion.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setHotelActionId(hotel.id);
      setMessage(null);

      await apiDelete(`/hotels/${hotel.id}`);

      setSelectedHotelId((current) =>
        current === hotel.id ? null : current
      );

      setMessage({
        type: "success",
        text: `"${hotel.name}" deleted successfully.`,
      });

      await loadHotels();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while deleting the hotel.",
      });
    } finally {
      setHotelActionId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const address = form.address.trim();

    if (!name) {
      setMessage({
        type: "error",
        text: "Hotel name is required.",
      });

      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      let hotelId = editingHotelId;

      if (editingHotelId) {
        const data = await apiPatch<{
          success?: boolean;
          message?: string;
          hotel?: Hotel;
        }>(`/hotels/${editingHotelId}`, {
          name,
          email: email || null,
          phone: phone || null,
          address: address || null,
        });

        hotelId = editingHotelId;

        setMessage({
          type: "success",
          text: data?.message || "Hotel updated successfully.",
        });
      } else {
        const data = await apiPost<{
          success?: boolean;
          message?: string;
          hotel?: Hotel;
        }>("/hotels", {
          name,
          email: email || null,
          phone: phone || null,
          address: address || null,
          is_active: true,
        });

        hotelId = data?.hotel?.id ?? null;

        setMessage({
          type: "success",
          text: data?.message || "Hotel added successfully.",
        });
      }

      if (hotelId && selectedFiles.length > 0) {
        await uploadHotelFiles(hotelId, selectedFiles);
      }

      setForm(emptyForm);
      setEditingHotelId(null);
      setSelectedFiles([]);
      setShowForm(false);

      await loadHotels();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while saving the hotel.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0b1220] text-white"
    >
      {/* Header */}
      <header className="fixed top-0 right-0 left-0 z-50 h-16 border-b border-slate-700/60 bg-[#111827]/95 backdrop-blur">
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
                Hotel Reservation System
              </h1>

              <p className="text-xs text-slate-400">
                Hotel Reservation System
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Content */}
      <section className="pt-24">
        <div className="p-6">
          {/* Title */}
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                🏨 Hotels
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Manage hotels and related data
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => loadHotels()}
                disabled={loading}
                className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Loading..." : "🔄 Refresh"}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (showForm) {
                    cancelHotelForm();
                  } else {
                    beginAddHotel();
                  }
                }}
                className="rounded-xl bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500"
              >
                {showForm ? "Cancel" : "➕ Add Hotel"}
              </button>
            </div>
          </div>

          {/* Message */}
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

          {/* Add Hotel Form */}
          {showForm && (
            <section className="mb-6 rounded-2xl border border-blue-500/20 bg-[#111827] p-6">
              <div className="mb-6">
                <h3 className="text-lg font-bold">
                  {editingHotelId ? "✏️ Edit Hotel" : "➕ Add New Hotel"}
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  {editingHotelId ? "Update hotel information and add new files." : "Enter the hotel details and save them to the database."}
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="grid gap-5 md:grid-cols-2"
              >
                {/* Name */}
                <div>
                  <label
                    htmlFor="hotel-name"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Hotel Name *
                  </label>

                  <input
                    id="hotel-name"
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      updateField("name", event.target.value)
                    }
                    placeholder="Example: Nile Hotel Cairo"
                    className="w-full rounded-xl border border-slate-600 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-blue-500"
                    disabled={saving}
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="hotel-email"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Email
                  </label>

                  <input
                    id="hotel-email"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateField("email", event.target.value)
                    }
                    placeholder="hotel@example.com"
                    className="w-full rounded-xl border border-slate-600 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-blue-500"
                    disabled={saving}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label
                    htmlFor="hotel-phone"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Phone
                  </label>

                  <input
                    id="hotel-phone"
                    type="text"
                    value={form.phone}
                    onChange={(event) =>
                      updateField("phone", event.target.value)
                    }
                    placeholder="01000000000"
                    className="w-full rounded-xl border border-slate-600 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-blue-500"
                    disabled={saving}
                  />
                </div>

                {/* Address */}
                <div>
                  <label
                    htmlFor="hotel-address"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Address
                  </label>

                  <input
                    id="hotel-address"
                    type="text"
                    value={form.address}
                    onChange={(event) =>
                      updateField("address", event.target.value)
                    }
                    placeholder="Cairo, Egypt"
                    className="w-full rounded-xl border border-slate-600 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-blue-500"
                    disabled={saving}
                  />
                </div>

                {/* Hotel Files */}
                <div className="md:col-span-2 rounded-2xl border border-slate-700/60 bg-[#0b1220] p-5">
                  <div className="mb-3">
                    <h4 className="font-semibold text-white">
                      Hotel Images & Documents
                    </h4>
                    <p className="mt-1 text-xs text-slate-400">
                      Upload multiple images or PDF files. No single image format is required.
                    </p>
                  </div>

                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileSelection}
                    disabled={saving || uploadingFiles}
                    className="block w-full rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white"
                  />

                  {selectedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {selectedFiles.map((file) => (
                        <div
                          key={`${file.name}-${file.size}-${file.lastModified}`}
                          className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-[#111827] px-4 py-3 text-sm"
                        >
                          <span className="truncate text-slate-200">
                            {file.name}
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {formatFileSize(file.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit */}
                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-green-600 px-7 py-3 font-semibold transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : editingHotelId
                        ? "💾 Save Changes"
                        : "💾 Save Hotel"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Hotels List */}
          <section className="rounded-2xl border border-slate-700/60 bg-[#111827]">
            <div className="flex items-center justify-between border-b border-slate-700/60 p-5">
              <div>
                <h3 className="font-semibold">
                  System Hotels
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  {loading
                    ? "Loading data..."
                    : `${hotels.length} registered hotel`}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <div className="text-4xl">
                  ⏳
                </div>

                <p className="mt-3 text-sm text-slate-400">
                  Loading hotels...
                </p>
              </div>
            ) : hotels.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl">
                  🏨
                </div>

                <p className="mt-4 text-lg font-semibold">
                  No hotels
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  Add the first hotel using the Add Hotel button.
                </p>

                <button
                  type="button"
                  onClick={beginAddHotel}
                  className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500"
                >
                  ➕ Add Hotel
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-slate-400">
                      <th className="px-5 py-4 text-right font-medium">
                        Hotel
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Email
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Phone
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Address
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Status
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Created At
                      </th>
                      <th className="px-5 py-4 text-center font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {hotels.map((hotel) => (
                      <tr
                        key={hotel.id}
                        className="border-b border-slate-800/70 transition hover:bg-slate-800/30"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">
                            {hotel.name}
                          </div>

                          <div className="mt-1 text-xs text-slate-500">
                            ID: {hotel.id}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          {hotel.email ? (
                            <span className="text-blue-300">
                              {hotel.email}
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              Not specified
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-slate-300">
                          {hotel.phone || "-"}
                        </td>

                        <td className="px-5 py-4 text-slate-300">
                          {hotel.address || "-"}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                              hotel.is_active
                                ? "border-green-500/20 bg-green-500/10 text-green-300"
                                : "border-red-500/20 bg-red-500/10 text-red-300"
                            }`}
                          >
                            {hotel.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-slate-400">
                          {formatDate(hotel.created_at)}
                        </td>

                        <td className="px-5 py-4 text-center">
                          <div className="flex flex-wrap justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => beginEditHotel(hotel)}
                              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setSelectedHotelId(
                                  selectedHotelId === hotel.id
                                    ? null
                                    : hotel.id
                                )
                              }
                              disabled={hotelActionId === hotel.id}
                              className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {selectedHotelId === hotel.id
                                ? "Hide Files"
                                : `Files${hotel.attachments?.length ? ` (${hotel.attachments.length})` : ""}`}
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleHotelStatus(hotel)}
                              disabled={hotelActionId === hotel.id}
                              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                hotel.is_active
                                  ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                                  : "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                              }`}
                            >
                              {hotelActionId === hotel.id
                                ? "Working..."
                                : hotel.is_active
                                  ? "Deactivate"
                                  : "Activate"}
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteHotel(hotel)}
                              disabled={hotelActionId === hotel.id}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedHotelId &&
            hotels
              .filter((hotel) => hotel.id === selectedHotelId)
              .map((hotel) => (
                <section
                  key={`attachments-${hotel.id}`}
                  className="mt-6 rounded-2xl border border-slate-700/60 bg-[#111827] p-6"
                >
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold">
                        Files for {hotel.name}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Images and PDF documents attached to this hotel.
                      </p>
                    </div>

                    <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                      {hotel.attachments?.length || 0} file(s)
                    </span>
                  </div>

                  {!hotel.attachments ||
                  hotel.attachments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                      No files uploaded for this hotel yet.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {hotel.attachments.map((attachment) => {
                        const isPdf =
                          attachment.is_pdf ||
                          attachment.content_type === "application/pdf" ||
                          attachment.original_name
                            .toLowerCase()
                            .endsWith(".pdf");

                        return (
                          <div
                            key={attachment.id}
                            className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220]"
                          >
                            <div className="flex h-40 items-center justify-center bg-slate-900">
                              {isPdf ? (
                                <span className="text-5xl">📄</span>
                              ) : (
                                <img
                                  src={`${API_BASE_URL}${attachment.url}`}
                                  alt={attachment.original_name}
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>

                            <div className="space-y-3 p-4">
                              <p className="truncate text-sm font-semibold text-slate-200">
                                {attachment.original_name}
                              </p>

                              <p className="text-xs text-slate-500">
                                {formatFileSize(
                                  attachment.file_size
                                )}
                              </p>

                              <div className="flex gap-2">
                                <a
                                  href={`${API_BASE_URL}${attachment.url}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-center text-xs text-slate-300 transition hover:bg-slate-800"
                                >
                                  Open
                                </a>

                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteHotelAttachment(
                                      hotel.id,
                                      attachment.id
                                    )
                                  }
                                  disabled={
                                    deletingAttachmentId ===
                                    attachment.id
                                  }
                                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {deletingAttachmentId ===
                                  attachment.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}

          {/* Helpful Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/new-reservation"
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500"
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
