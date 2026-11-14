import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Blip Club",
    short_name: "Blip Club",
    description: "Plans with your people: your calendar, teams, chats and what's on your radar.",
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
