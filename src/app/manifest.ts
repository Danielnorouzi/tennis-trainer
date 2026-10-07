import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rally AI — Tennis Coach",
    short_name: "Rally AI",
    description: "Your personal tennis coach. Powered by AI.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c0d0f",
    theme_color: "#2b8a4f",
    categories: ["sports", "health", "fitness"],
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Live Coach", url: "/coach/live" },
      { name: "Analyze video", url: "/analyze" },
    ],
  };
}
