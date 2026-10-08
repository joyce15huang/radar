import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { TimeZoneSync } from "@/components/TimeZoneSync";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  applicationName: "Personal Daily Digest",
  title: "Personal Daily Digest",
  description:
    "A calm, finite morning briefing. Clear the deck and you're caught up for the day.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Digest" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#fafafa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <TimeZoneSync />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
