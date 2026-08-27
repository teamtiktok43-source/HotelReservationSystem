"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

type User = {
  id: number;
  username: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean;
  created_at?: string | null;
};

type UserForm = {
  username: string;
  password: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const ROLE_OPTIONS = [
  "Manager",
  "IT",
  "Reservation Employee",
] as const;

type SystemRole = (typeof ROLE_OPTIONS)[number];

function normalizeRole(role?: string | null): SystemRole {
  const value = (role || "").trim().toLowerCase();

  if (value === "it") return "IT";
  if (
    value === "reservation employee" ||
    value === "reservation_employee"
  ) {
    return "Reservation Employee";
  }

  return "Manager";
}

const emptyForm: UserForm = {
  username: "",
  password: "",
  full_name: "",
  role: "Manager",
  is_active: true,
};

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

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

  const loadUsers = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setMessage(null);

      const data = await apiGet<User[]>("/users");

      if (!Array.isArray(data)) {
        throw new Error("Invalid users response from the backend.");
      }

      setUsers(data);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while loading users.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();

    const interval = window.setInterval(() => {
      void loadUsers(true);
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return users;
    }

    return users.filter((user) => {
      return (
        user.username?.toLowerCase().includes(value) ||
        user.full_name?.toLowerCase().includes(value) ||
        normalizeRole(user.role).toLowerCase().includes(value)
      );
    });
  }, [users, search]);

  const stats = useMemo(() => {
    const active = users.filter((user) => user.is_active).length;
    const inactive = users.length - active;

    return {
      total: users.length,
      active,
      inactive,
      managers: users.filter(
        (user) => normalizeRole(user.role) === "Manager"
      ).length,
    };
  }, [users]);

  function openCreateModal() {
    setEditingUser(null);
    setForm(emptyForm);
    setMessage(null);
    setModalOpen(true);
  }

  function openEditModal(user: User) {
    setEditingUser(user);

    setForm({
      username: user.username || "",
      password: "",
      full_name: user.full_name || "",
      role: normalizeRole(user.role),
      is_active: user.is_active,
    });

    setMessage(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  }

  async function saveUser() {
    if (!form.username.trim()) {
      setMessage({
        type: "error",
        text: "Username is required.",
      });
      return;
    }

    if (!editingUser && !form.password) {
      setMessage({
        type: "error",
        text: "Password is required when creating a new user.",
      });
      return;
    }

    if (form.password && form.password.length < 6) {
      setMessage({
        type: "error",
        text: "Password must be at least 6 characters.",
      });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      const payload: Record<string, unknown> = {
        username: form.username.trim(),
        full_name: form.full_name.trim() || null,
        role: form.role.trim() || null,
        is_active: form.is_active,
      };

      if (form.password) {
        payload.password = form.password;
      }

      const data = editingUser
        ? await apiPatch<{ message?: string }>(
            `/users/${editingUser.id}`,
            payload
          )
        : await apiPost<{ message?: string }>(
            "/users",
            payload
          );

      setMessage({
        type: "success",
        text: editingUser
          ? "User updated successfully."
          : "User added successfully.",
      });

      setModalOpen(false);
      setEditingUser(null);
      setForm(emptyForm);

      await loadUsers(true);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while saving the user.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleUser(user: User) {
    try {
      setMessage(null);

      await apiPatch(
        `/users/${user.id}/status`,
        {
          is_active: !user.is_active,
        }
      );

      setMessage({
        type: "success",
        text: user.is_active
          ? `User ${user.username} disabled.`
          : `User ${user.username} enabled.`,
      });

      await loadUsers(true);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An error occurred while changing user status.",
      });
    }
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
                👥 Users
              </h2>

              <p className="mt-1 text-sm text-[#9AA8B3]">
                Manage system users, permissions, and account status
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => loadUsers(true)}
                disabled={loading || refreshing}
                className="rounded-xl border border-[#394B58] bg-[#141C23] px-4 py-3 text-sm font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "🔄 Refresh"}
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-xl bg-teal-600 px-5 py-3 font-semibold transition hover:bg-teal-500"
              >
                ➕ New User
              </button>
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
            <StatCard
              label="Total Users"
              value={loading ? "..." : String(stats.total)}
              icon="👥"
            />

            <StatCard
              label="Active Users"
              value={loading ? "..." : String(stats.active)}
              icon="✅"
              tone="green"
            />

            <StatCard
              label="Disabled Users"
              value={loading ? "..." : String(stats.inactive)}
              icon="⛔"
              tone="red"
            />

            <StatCard
              label="Managers"
              value={loading ? "..." : String(stats.managers)}
              icon="🛡️"
              tone="blue"
            />
          </div>

          <div className="mb-6 rounded-2xl border border-[#2A3843] bg-[#141C23] p-5">
            <label
              htmlFor="user-search"
              className="text-sm text-[#9AA8B3]"
            >
              Search
            </label>

            <input
              id="user-search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Username, name, or role..."
              className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition placeholder:text-[#586874] focus:border-teal-400"
            />
          </div>

          {loading ? (
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-12 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#30404C] border-t-blue-500" />

              <p className="text-sm text-[#9AA8B3]">
                Loading users...
              </p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-12 text-center">
              <div className="text-5xl">👥</div>

              <h3 className="mt-4 text-lg font-semibold">
                {users.length === 0
                  ? "No users"
                  : "No results"}
              </h3>

              <p className="mt-2 text-sm text-[#9AA8B3]">
                {users.length === 0
                  ? "Create the first system user using the New User button."
                  : "Try changing the search text."}
              </p>

              {users.length === 0 && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-6 rounded-xl bg-teal-600 px-5 py-3 font-semibold hover:bg-teal-500"
                >
                  ➕ Create User
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#2A3843] bg-[#141C23]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="border-b border-[#2A3843] bg-[#1B2730]/70">
                    <tr>
                      <th className="px-5 py-4 text-right">
                        User
                      </th>

                      <th className="px-5 py-4 text-right">
                        Name
                      </th>

                      <th className="px-5 py-4 text-right">
                        Role
                      </th>

                      <th className="px-5 py-4 text-right">
                        Status
                      </th>

                      <th className="px-5 py-4 text-right">
                        Created At
                      </th>

                      <th className="px-5 py-4 text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-[#26333D] hover:bg-[#1B2730]/45"
                      >
                        <td className="px-5 py-4 font-semibold text-teal-300">
                          {user.username}
                        </td>

                        <td className="px-5 py-4 text-[#D7E0E6]">
                          {user.full_name || "-"}
                        </td>

                        <td className="px-5 py-4 text-[#C2CDD5]">
                          {normalizeRole(user.role)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                              user.is_active
                                ? "border-green-500/20 bg-green-500/10 text-green-300"
                                : "border-red-500/20 bg-red-500/10 text-red-300"
                            }`}
                          >
                            {user.is_active
                              ? "Active"
                              : "Disabled"}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-[#9AA8B3]">
                          {formatDateTime(
                            user.created_at
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openEditModal(user)
                              }
                              className="rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-300 transition hover:bg-teal-500/20"
                            >
                              ✏️ Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                toggleUser(user)
                              }
                              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                user.is_active
                                  ? "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                  : "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                              }`}
                            >
                              {user.is_active
                                ? "⛔ Disable"
                                : "✅ Enable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-[#73828D]">
            Password changes are available from the Edit User button, and current passwords are not
            displayed.
          </p>
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-[#30404C] bg-[#141C23] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#30404C] p-5">
              <div>
                <h3 className="text-xl font-bold">
                  {editingUser
                    ? "✏️ Edit User"
                    : "➕ New User"}
                </h3>

                <p className="mt-1 text-xs text-[#9AA8B3]">
                  {editingUser
                    ? "Edit user data or password"
                    : "Add a new system user"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-[#9AA8B3] hover:bg-[#1B2730] hover:text-[#F3F7F9] disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field
                label="Username *"
                value={form.username}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    username: value,
                  }))
                }
                placeholder="Example: mostafa"
              />

              <Field
                label={
                  editingUser
                    ? "New password (optional)"
                    : "Password *"
                }
                type="password"
                value={form.password}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    password: value,
                  }))
                }
                placeholder={
                  editingUser
                    ? "Leave blank if you do not want to change it"
                    : "At least 6 characters"
                }
              />

              <Field
                label="Full Name"
                value={form.full_name}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    full_name: value,
                  }))
                }
                placeholder="Example: Mostafa Amer"
              />

              <div>
                <label
                  htmlFor="user-role"
                  className="mb-2 block text-sm text-[#9AA8B3]"
                >
                  Role *
                </label>

                <select
                  id="user-role"
                  value={normalizeRole(form.role)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as SystemRole,
                    }))
                  }
                  className="w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition focus:border-teal-400"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-[#30404C] bg-[#0B1116] p-4 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      is_active: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-blue-600"
                />

                <span>
                  <span className="block text-sm font-semibold">
                    User is active
                  </span>

                  <span className="mt-1 block text-xs text-[#73828D]">
                    Disabled users cannot sign in.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#30404C] p-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-xl border border-[#394B58] px-5 py-3 font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730] disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveUser}
                disabled={saving}
                className="rounded-xl bg-teal-600 px-5 py-3 font-semibold transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingUser
                  ? "💾 Save Changes"
                  : "➕ Add User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-[#9AA8B3]">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-sm text-[#F3F7F9] outline-none transition placeholder:text-[#586874] focus:border-teal-400"
      />
    </div>
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
  tone?: "slate" | "green" | "red" | "blue";
}) {
  const toneClasses = {
    slate: "border-[#2A3843]",
    green: "border-green-500/20",
    red: "border-red-500/20",
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

          <p className="mt-2 text-3xl font-bold">
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
