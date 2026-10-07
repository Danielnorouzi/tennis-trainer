import { notFound } from "next/navigation";
import { SeedTool } from "./seed-tool";

/**
 * DEVELOPMENT ONLY. Creates clearly labelled synthetic sessions from the licensed synthetic pose
 * fixtures used by the unit tests, so report, progress, compare and chat screens can be exercised
 * end-to-end without a camera. Returns 404 in production builds.
 */
export default function SeedPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SeedTool />;
}
