"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiPatch, apiPost, getUsers, ManagedUser } from "../lib/api";



type User = {
  id: number;
  username: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean;
  created_at?: string | null;
  last_login_at?: string | null;
  last_activity_at?: string | null;
  active_sessions: number;
  online: boolean;
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

const emptyForm: UserForm = {
  username: "",
  password: "",
  full_name: "",
  role: "Administrator",
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

      const data = await getUsers();
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
      async function forceLogout(user: User) {
    if (user.active_sessions <= 0) {
      setMessage({ type: "error", text: "This user has no active sessions." });
      return;
    }
    const confirmed = window.confirm(`Force logout ${user.username} from all active devices?`);
    if (!confirmed) return;
    try {
      const data = await apiPost<{ success: boolean; message: string }>(`/users/${user.id}/force-logout`);
      setMessage({ type: "success", text: data.message });
      await loadUsers(true);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not force logout the user." });
    }
  }

  return (
        user.username?.toLowerCase().includes(value) ||
        user.full_name?.toLowerCase().includes(value) ||
        user.role?.toLowerCase().includes(value)
      );
    });
  }, [users, search]);

  const stats = useMemo(() => {
    const active = users.filter((user) => user.is_active).length;
    const inactive = users.length - active;
    const online = users.filter((user) => user.online).length;

    return {
      total: users.length,
      active,
      inactive,
      online,
      admins: users.filter(
        (user) =>
          (user.role || "").toLowerCase() ===
          "administrator"
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
      role: user.role || "User",
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
        ? await apiPatch<{ success: boolean; message: string; user: User }>(
            `/users/${editingUser.id}`,
            payload
          )
        : await apiPost<{ success: boolean; message: string; user: User }>(
            "/users",
            payload
          );

      setMessage({ type: "success", text: data.message || (editingUser ? "User updated successfully." : "User added successfully.") });
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

      const data = await apiPatch<{ success: boolean; message: string; user: User }>(
        `/users/${user.id}/status`,
        { is_active: !user.is_active }
      );

      setMessage({ type: "success", text: data.message });
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
      className="min-h-screen bg-[#0b1220] text-white"
    >
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

      <section className="pt-24">
        <div className="p-6">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                👥 Users
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Manage system users, permissions, and account status
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => loadUsers(true)}
                disabled={loading || refreshing}
                className="rounded-xl border border-slate-600 bg-[#111827] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "🔄 Refresh"}
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-xl bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500"
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
              label="Administrators"
              value={loading ? "..." : String(stats.admins)}
              icon="🛡️"
              tone="blue"
            />
          </div>

          <div className="mb-6 rounded-2xl border border-slate-700/60 bg-[#111827] p-5">
            <label
              htmlFor="user-search"
              className="text-sm text-slate-400"
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
              className="mt-2 w-full rounded-xl border border-slate-600 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500"
            />
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-700/60 bg-[#111827] p-12 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500" />

              <p className="text-sm text-slate-400">
                Loading users...
              </p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-2xl border border-slate-700/60 bg-[#111827] p-12 text-center">
              <div className="text-5xl">👥</div>

              <h3 className="mt-4 text-lg font-semibold">
                {users.length === 0
                  ? "No users"
                  : "No results"}
              </h3>

              <p className="mt-2 text-sm text-slate-400">
                {users.length === 0
                  ? "Create the first system user using the New User button."
                  : "Try changing the search text."}
              </p>

              {users.length === 0 && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-6 rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500"
                >
                  ➕ Create User
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-[#111827]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead className="border-b border-slate-700/60 bg-slate-800/40">
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

                      <th className="px-5 py-4 text-right">Session</th>
                      <th className="px-5 py-4 text-right">Last Login</th>
                      <th className="px-5 py-4 text-right">Last Activity</th>
                      <th className="px-5 py-4 text-right">Created At</th>

                      <th className="px-5 py-4 text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-slate-800/70 hover:bg-slate-800/30"
                      >
                        <td className="px-5 py-4 font-semibold text-blue-300">
                          {user.username}
                        </td>

                        <td className="px-5 py-4 text-slate-200">
                          {user.full_name || "-"}
                        </td>

                        <td className="px-5 py-4 text-slate-300">
                          {user.role || "-"}
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

                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${user.online ? "border-green-500/20 bg-green-500/10 text-green-300" : "border-slate-600 bg-slate-800 text-slate-400"}`}>
                            {user.online ? "🟢 Online" : "⚪ Offline"}
                          </span>
                          <div className="mt-1 text-xs text-slate-500">{user.active_sessions || 0} active</div>
                        </td>
                        <td className="px-5 py-4 text-slate-400">{formatDateTime(user.last_login_at)}</td>
                        <td className="px-5 py-4 text-slate-400">{formatDateTime(user.last_activity_at)}</td>
                        <td className="px-5 py-4 text-slate-400">{formatDateTime(user.created_at)}</td>

                        <td className="px-5 py-4">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openEditModal(user)
                              }
                              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20"
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

                            <button
                              type="button"
                              onClick={() => forceLogout(user)}
                              disabled={user.active_sessions <= 0}
                              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              🚪 Force Logout
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

          <p className="mt-4 text-xs text-slate-500">
            Password changes are available from the Edit User button, and current passwords are not
            displayed.
          </p>
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#111827] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 p-5">
              <div>
                <h3 className="text-xl font-bold">
                  {editingUser
                    ? "✏️ Edit User"
                    : "➕ New User"}
                </h3>

                <p className="mt-1 text-xs text-slate-400">
                  {editingUser
                    ? "Edit user data or password"
                    : "Add a new system user"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
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

              <Field
                label="Role"
                value={form.role}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    role: value,
                  }))
                }
                placeholder="Administrator"
              />

              <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-[#0b1220] p-4 md:col-span-2">
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

                  <span className="mt-1 block text-xs text-slate-500">
                    Disabled users cannot sign in.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-700 p-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-xl border border-slate-600 px-5 py-3 font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveUser}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
      <label className="mb-2 block text-sm text-slate-400">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-600 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500"
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
    slate: "border-slate-700/60",
    green: "border-green-500/20",
    red: "border-red-500/20",
    blue: "border-blue-500/20",
  };

  return (
    <div
      className={`rounded-2xl border bg-[#111827] p-5 ${toneClasses[tone]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">
            {label}
          </p>

          <p className="mt-2 text-3xl font-bold">
            {value}
          </p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800/70 text-xl">
          {icon}
        </div>
      </div>
    </div>
  );
}
