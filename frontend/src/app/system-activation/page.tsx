"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  activateLicense,
  generateLicenseCode,
  getCurrentUser,
  getLicenseStatus,
  type CurrentUser,
  type LicenseStatus,
} from "../lib/api";

function normalizeRole(role?: string | null) {
  const value = (role || "").trim().toLowerCase();

  if (value === "it") {
    return "IT";
  }

  if (
    value === "reservation employee" ||
    value === "reservation_employee" ||
    value === "reservation officer"
  ) {
    return "Reservation Employee";
  }

  return "Manager";
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SystemActivationPage() {
  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null);

  const [license, setLicense] =
    useState<LicenseStatus | null>(null);

  const [code, setCode] = useState("");

  const [generatedCode, setGeneratedCode] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [generating, setGenerating] =
    useState(false);

  const [activating, setActivating] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [userResponse, licenseResponse] =
        await Promise.all([
          getCurrentUser(),
          getLicenseStatus(),
        ]);

      setCurrentUser(userResponse.user);
      setLicense(licenseResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load system activation data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentRole = normalizeRole(
    currentUser?.role
  );

  const isIT = currentRole === "IT";

  const handleGenerateCode = async () => {
    try {
      setGenerating(true);
      setError("");
      setSuccess("");
      setGeneratedCode("");

      const response =
        await generateLicenseCode();

      setGeneratedCode(response.code);

      setSuccess(
        `A new ${response.valid_for_days}-day activation code has been generated.`
      );
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Could not generate activation code."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleActivate = async () => {
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setError(
        "Please enter the activation code."
      );
      return;
    }

    try {
      setActivating(true);
      setError("");
      setSuccess("");

      const response =
        await activateLicense(trimmedCode);

      setSuccess(
        `System activated successfully for ${response.days} days.`
      );

      setCode("");
      setGeneratedCode("");

      const updatedLicense =
        await getLicenseStatus();

      setLicense(updatedLicense);
    } catch (activateError) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : "Could not activate the system."
      );
    } finally {
      setActivating(false);
    }
  };

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0B1116] text-[#F3F7F9]"
    >
      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-[#2A3843] bg-[#141C23]/95 backdrop-blur">
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
                System Activation
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold">
              {loading
                ? "Loading..."
                : currentUser?.full_name ||
                  currentUser?.username ||
                  "Current User"}
            </p>

            <p className="text-xs text-teal-400">
              {loading
                ? "Loading..."
                : currentRole}
            </p>
          </div>
        </div>
      </header>

      {/* Main */}
      <section className="min-h-screen px-5 pb-12 pt-28">
        <div className="mx-auto max-w-4xl">
          {/* Title */}
          <div className="mb-8">
            <div className="mb-3 inline-flex rounded-full border border-teal-400/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
              System License
            </div>

            <h2 className="text-3xl font-bold">
              System Activation
            </h2>

            <p className="mt-2 max-w-2xl text-sm text-[#9AA8B3]">
              Manage the monthly activation license
              required to keep the Hotel Reservation
              System running.
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-10 text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#30404C] border-t-teal-400" />

              <p className="mt-4 text-sm text-[#9AA8B3]">
                Loading license information...
              </p>
            </div>
          )}

          {!loading && (
            <>
              {/* Error */}
              {error && (
                <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4">
                  <p className="font-semibold text-red-300">
                    ❌ Activation Error
                  </p>

                  <p className="mt-1 text-sm text-red-200/80">
                    {error}
                  </p>
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4">
                  <p className="font-semibold text-green-300">
                    ✅ Success
                  </p>

                  <p className="mt-1 text-sm text-green-200/80">
                    {success}
                  </p>
                </div>
              )}

              {/* License Status */}
              <div className="mb-6 grid gap-5 md:grid-cols-3">
                <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
                  <p className="text-sm text-[#9AA8B3]">
                    License Status
                  </p>

                  <div className="mt-3">
                    {license?.active ? (
                      <span className="inline-flex rounded-full border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-300">
                        ● Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300">
                        ● Expired
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
                  <p className="text-sm text-[#9AA8B3]">
                    Days Remaining
                  </p>

                  <p
                    className={`mt-3 text-3xl font-bold ${
                      license?.active
                        ? "text-teal-300"
                        : "text-red-300"
                    }`}
                  >
                    {license?.days_remaining ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
                  <p className="text-sm text-[#9AA8B3]">
                    Expiration Date
                  </p>

                  <p className="mt-3 text-lg font-semibold text-[#F3F7F9]">
                    {formatDate(
                      license?.expires_at
                    )}
                  </p>
                </div>
              </div>

              {/* Current License Information */}
              <div className="mb-6 rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
                <h3 className="text-lg font-semibold">
                  License Information
                </h3>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#2A3843] bg-[#0B1116] p-4">
                    <p className="text-xs text-[#73828D]">
                      Activated At
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {formatDate(
                        license?.activated_at
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#2A3843] bg-[#0B1116] p-4">
                    <p className="text-xs text-[#73828D]">
                      Expires At
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {formatDate(
                        license?.expires_at
                      )}
                    </p>
                  </div>
                </div>

                {license?.message && (
                  <div className="mt-4 rounded-xl border border-teal-400/20 bg-teal-500/5 px-4 py-3 text-sm text-teal-200">
                    {license.message}
                  </div>
                )}
              </div>

              {/* IT Controls */}
              {isIT ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Generate */}
                  <div className="rounded-2xl border border-teal-400/20 bg-[#141C23] p-6">
                    <div className="mb-5">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-xl">
                        🔑
                      </div>

                      <h3 className="text-lg font-semibold">
                        Generate Activation Code
                      </h3>

                      <p className="mt-1 text-sm text-[#9AA8B3]">
                        Generate a new monthly activation
                        code for the system.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateCode}
                      disabled={generating}
                      className="w-full rounded-xl bg-teal-600 px-5 py-3 font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generating
                        ? "Generating..."
                        : "Generate Activation Code"}
                    </button>

                    {generatedCode && (
                      <div className="mt-5 rounded-xl border border-teal-400/30 bg-[#0B1116] p-4">
                        <p className="text-xs text-[#73828D]">
                          New Activation Code
                        </p>

                        <div className="mt-2 break-all rounded-lg border border-[#394B58] bg-[#141C23] px-4 py-3 text-center font-mono text-lg font-bold tracking-widest text-teal-300">
                          {generatedCode}
                        </div>

                        <p className="mt-2 text-xs text-[#73828D]">
                          Keep this code secure. It can be
                          entered below to activate the
                          system.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Activate */}
                  <div className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
                    <div className="mb-5">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/10 text-xl">
                        🛡️
                      </div>

                      <h3 className="text-lg font-semibold">
                        Activate System
                      </h3>

                      <p className="mt-1 text-sm text-[#9AA8B3]">
                        Enter the activation code to unlock
                        the system.
                      </p>
                    </div>

                    <label
                      htmlFor="activation-code"
                      className="text-sm font-medium text-[#C2CDD5]"
                    >
                      Activation Code
                    </label>

                    <input
                      id="activation-code"
                      type="text"
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !activating
                        ) {
                          void handleActivate();
                        }
                      }}
                      placeholder="Enter activation code..."
                      autoComplete="off"
                      className="mt-2 w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 font-mono text-sm text-[#F3F7F9] outline-none transition placeholder:text-[#586874] focus:border-teal-400"
                    />

                    <button
                      type="button"
                      onClick={handleActivate}
                      disabled={
                        activating ||
                        !code.trim()
                      }
                      className="mt-4 w-full rounded-xl border border-green-400/30 bg-green-500/10 px-5 py-3 font-semibold text-green-300 transition hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {activating
                        ? "Activating..."
                        : "Activate System"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Non-IT */
                <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10 text-2xl">
                      🔒
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-yellow-200">
                        IT Activation Required
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-[#C2CDD5]">
                        The system license has expired.
                        Please contact the IT user to
                        generate and activate the next
                        monthly license.
                      </p>

                      <p className="mt-3 text-xs text-[#73828D]">
                        Current user:{" "}
                        <span className="font-semibold text-[#C2CDD5]">
                          {currentUser?.full_name ||
                            currentUser?.username ||
                            "-"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-[#394B58] bg-[#141C23] px-5 py-3 text-sm font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730]"
                >
                  ← Back to Dashboard
                </Link>

                {isIT && (
                  <Link
                    href="/settings"
                    className="rounded-xl border border-[#394B58] bg-[#141C23] px-5 py-3 text-sm font-semibold text-[#D7E0E6] transition hover:bg-[#1B2730]"
                  >
                    ⚙️ Settings
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}