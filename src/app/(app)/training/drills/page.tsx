import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { DrillLibrary } from "./drill-library";

export const metadata = { title: "Drill library" };

export default function DrillsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DrillLibrary />
    </Suspense>
  );
}
