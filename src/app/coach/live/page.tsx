import { Suspense } from "react";
import { LiveCoach } from "./live-coach";

export const metadata = { title: "Live Coach" };

export default function LiveCoachPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <LiveCoach />
    </Suspense>
  );
}
