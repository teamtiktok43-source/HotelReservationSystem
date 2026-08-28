import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://hotel-reservation-system.orkestr.run"
  ),

  title: "Hotel Reservation System",

  description:
    "Hotel Reservation Management System",

  applicationName: "Hotel Reservation System",

  generator: "Hotel Reservation System",

  openGraph: {
    title: "Hotel Reservation System",
    description:
      "Hotel Reservation Management System",
    url: "https://hotel-reservation-system.orkestr.run",
    siteName: "Hotel Reservation System",
    type: "website",
  },

  twitter: {
    card: "summary",
    title: "Hotel Reservation System",
    description:
      "Hotel Reservation Management System",
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}