import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { TimeZoneSync } from "@/components/TimeZoneSync";

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
  title: "Personal Daily Digest",
  description:
    "A calm, finite morning briefing. Clear the deck and you're caught up for the day.",
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
        {children}
      </body>
    </html>
  );
}
