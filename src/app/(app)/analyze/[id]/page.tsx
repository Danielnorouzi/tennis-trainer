import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { SessionDetail } from "../../sessions/[id]/session-detail";

/** Analysis workspace for an uploaded video (same report + review tools as live sessions). */
export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SessionDetail id={id} />
    </Suspense>
  );
}
