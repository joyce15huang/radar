import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Daily Digest",
    short_name: "Digest",
    description:
      "A calm, finite morning briefing. Clear the deck and you're caught up for the day.",
    start_url: "/calendar",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F0E8",
    theme_color: "#F7F0E8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
