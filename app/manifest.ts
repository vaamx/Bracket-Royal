import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bracket Royale · World Cup 2026 Predictions",
    short_name: "Bracket Royale",
    description: "Predict every match, build your bracket, climb the leaderboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1428",
    theme_color: "#0a1428",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
