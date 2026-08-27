"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE_URL = "http://localhost:8000";

export default function Home() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");

    const cleanUsername = username.trim();

    if (!cleanUsername || !password.trim()) {
      setError("Please enter username and password");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          typeof data?.detail === "string"
            ? data.detail
            : "An error occurred during login"
        );
        return;
      }

      if (!data?.user) {
        setError("Login succeeded, but user information was not returned.");
        return;
      }

      // Keep a lightweight copy for the frontend UI.
      // Authentication itself is handled by the backend session cookie.
      localStorage.setItem(
        "hotel_user",
        JSON.stringify(data.user)
      );

      // Navigate to Dashboard.
      router.push("/dashboard");
    } catch (error) {
      console.error(error);

      setError(
        "Could not connect to the server. Make sure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0B1116] flex items-center justify-center px-4"
    >
      <div className="w-full max-w-md">

        {/* Logo / Title */}
        <div className="text-center mb-8">

          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#155E75] shadow-lg shadow-teal-950/40">
            <span className="text-3xl">
              🏨
            </span>
          </div>

          <h1 className="text-3xl font-bold text-[#F3F7F9]">
            Hotel Reservation System
          </h1>

          <p className="mt-2 text-sm text-[#9AA8B3]">
            Online Reservation Management
          </p>

        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-7 shadow-2xl">

          <div className="mb-6">

            <h2 className="text-xl font-semibold text-[#F3F7F9]">
              Sign In
            </h2>

            <p className="mt-1 text-sm text-[#9AA8B3]">
              Sign in to access the system
            </p>

          </div>

          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >

            {/* Username */}
            <div>

              <label
                htmlFor="username"
                className="mb-2 block text-sm font-medium text-[#C2CDD5]"
              >
                Username
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value)
                }
                placeholder="Enter username"
                className="w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-[#F3F7F9] outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 placeholder:text-[#586874]"
                autoComplete="username"
                disabled={loading}
              />

            </div>

            {/* Password */}
            <div>

              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-[#C2CDD5]"
              >
                Password
              </label>

              <div className="relative">

                <input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  placeholder="Enter password"
                  className="w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 pr-20 text-[#F3F7F9] outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 placeholder:text-[#586874]"
                  autoComplete="current-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-teal-400 hover:text-teal-300 disabled:opacity-50"
                >
                  {showPassword
                    ? "Hide"
                    : "Show"}
                </button>

              </div>

            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-teal-600 py-3.5 font-semibold text-[#F3F7F9] shadow-lg shadow-teal-950/30 transition hover:bg-teal-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Signing in..."
                : "Sign In"}
            </button>

          </form>

        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[#73828D]">
          Hotel Reservation System © 2026
        </p>

      </div>
    </main>
  );
}
