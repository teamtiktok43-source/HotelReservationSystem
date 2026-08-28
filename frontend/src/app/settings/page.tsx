"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL, apiGet, apiPost } from "../lib/api";

type GoogleStatus = {
  connected: boolean;
  email: string;
  provider: string;
};

type MessageState = {
  type: "success" | "error";
  text: string;
} | null;

export default function SettingsPage() {
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({
    connected: false,
    email: "",
    provider: "gmail",
  });

  const [testRecipient, setTestRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  const loadGoogleStatus = async () => {
    setLoading(true);

    try {
      const data = await apiGet<GoogleStatus>(
        "/auth/google/status"
      );

      setGoogleStatus({
        connected: Boolean(data?.connected),
        email: data?.email || "",
        provider: data?.provider || "gmail",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not connect to the server.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get("google");

    if (googleResult === "connected") {
      setMessage({
        type: "success",
        text: "Gmail account connected successfully ✅",
      });

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    } else if (googleResult === "error") {
      setMessage({
        type: "error",
        text:
          "Could not complete Gmail connection. Complete Google permissions and try again.",
      });

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }

    loadGoogleStatus();
  }, []);

  const connectGoogle = () => {
    setMessage(null);
    setConnecting(true);

    window.location.href = `${API_BASE_URL}/auth/google/start`;
  };

  const disconnectGoogle = async () => {
    setMessage(null);

    const confirmed = window.confirm(
      "Are you sure you want to disconnect the current Gmail account?"
    );

    if (!confirmed) {
      return;
    }

    setDisconnecting(true);

    try {
      const data = await apiPost<{
        success?: boolean;
        message?: string;
      }>("/auth/google/disconnect");

      setGoogleStatus({
        connected: false,
        email: "",
        provider: "gmail",
      });

      setMessage({
        type: "success",
        text: "Gmail account disconnected successfully.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not disconnect Gmail.",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const testEmail = async () => {
    setMessage(null);

    if (!googleStatus.connected) {
      setMessage({
        type: "error",
        text: "Connect Gmail before sending a test email.",
      });
      return;
    }

    if (!testRecipient.trim()) {
      setMessage({
        type: "error",
        text: "Enter the email address for the test message.",
      });
      return;
    }

    setTesting(true);

    try {
      const data = await apiPost<{
        success?: boolean;
        message?: string;
      }>("/email-settings/test", {
        recipient_email: testRecipient.trim(),
      });

      setMessage({
        type: "success",
        text: `Test email sent to ${testRecipient.trim()} ✅`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Email test failed.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#0B1116] text-[#F3F7F9]"
    >
      <header className="border-b border-[#2A3843] bg-[#141C23]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold">
              ⚙️ Settings
            </h1>

            <p className="mt-1 text-sm text-[#9AA8B3]">
              Reservation system and email settings
            </p>
          </div>

          <Link
            href="/dashboard"
            className="rounded-xl border border-[#394B58] px-4 py-2 text-sm text-[#D7E0E6] transition hover:bg-[#1B2730]"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl p-6">
        {message && (
          <div
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              message.type === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {message.type === "error" ? "❌ " : "✅ "}
            {message.text}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">
                  📧 Email Settings
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#9AA8B3]">
                  Connect your Gmail account once through Google, then
                  the system can send reservations without an App Password.
                </p>
              </div>

              <div
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  loading
                    ? "bg-[#35434D]/20 text-[#C2CDD5]"
                    : googleStatus.connected
                      ? "bg-green-500/10 text-green-300"
                      : "bg-yellow-500/10 text-yellow-300"
                }`}
              >
                {loading
                  ? "Loading..."
                  : googleStatus.connected
                    ? "🟢 Gmail connected"
                    : "🟡 Gmail not connected"}
              </div>
            </div>

            <div className="rounded-2xl border border-[#30404C] bg-[#0B1116] p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-[#9AA8B3]">
                    Gmail account used to send reservations
                  </p>

                  <p className="mt-2 break-all text-lg font-semibold text-[#F3F7F9]">
                    {googleStatus.connected
                      ? googleStatus.email
                      : "No Gmail account connected"}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:min-w-[190px]">
                  <button
                    type="button"
                    onClick={connectGoogle}
                    disabled={connecting || loading}
                    className="rounded-xl bg-teal-600 px-4 py-3 font-semibold transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {connecting
                      ? "Opening Google..."
                      : googleStatus.connected
                        ? "🔄 Change Gmail Account"
                        : "🔗 Connect Gmail"}
                  </button>

                  {googleStatus.connected && (
                    <button
                      type="button"
                      onClick={disconnectGoogle}
                      disabled={disconnecting}
                      className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {disconnecting
                        ? "Disconnecting..."
                        : "Disconnect Gmail"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-teal-400/20 bg-teal-500/10 p-4 text-sm text-[#C2CDD5]">
              <p className="font-semibold text-teal-300">
                🔐 Security Method
              </p>

              <p className="mt-2 leading-7">
                The account is connected through Google OAuth 2.0. The system does not
                ask for a Gmail App Password or require you to enter your Gmail
                password in the website.
              </p>

              <p className="mt-2 leading-7 text-[#9AA8B3]">
                When changing the account, click “Change Gmail Account” and sign in
                with the new account through Google.
              </p>
            </div>

            {googleStatus.connected && (
              <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/10 p-4">
                <p className="font-semibold text-green-300">
                  ✅ Account Ready to Send
                </p>

                <p className="mt-1 text-sm leading-6 text-[#C2CDD5]">
                  Reservations sent to hotels will use the
                  currently connected Gmail account.
                </p>
              </div>
            )}
          </section>

          <aside className="h-fit rounded-2xl border border-[#2A3843] bg-[#141C23] p-6">
            <h2 className="text-lg font-bold">
              🧪 Email Test
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#9AA8B3]">
              After connecting Gmail, send a test message to confirm that the
              sending account works before sending real reservations.
            </p>

            <label
              htmlFor="test-recipient"
              className="mb-2 mt-6 block text-sm text-[#C2CDD5]"
            >
              Recipient Email *
            </label>

            <input
              id="test-recipient"
              type="email"
              value={testRecipient}
              onChange={(e) =>
                setTestRecipient(e.target.value)
              }
              placeholder="test@example.com"
              className="w-full rounded-xl border border-[#394B58] bg-[#0B1116] px-4 py-3 text-[#F3F7F9] outline-none focus:border-teal-400"
            />

            <button
              type="button"
              onClick={testEmail}
              disabled={
                testing ||
                loading ||
                !googleStatus.connected
              }
              className="mt-4 w-full rounded-xl border border-green-500/40 bg-green-500/10 py-3 font-semibold text-green-300 transition hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing
                ? "Sending..."
                : "📨 Send Test Email"}
            </button>

            {!googleStatus.connected && !loading && (
              <p className="mt-4 text-xs leading-5 text-yellow-300">
                Connect Gmail first to enable the email test.
              </p>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
