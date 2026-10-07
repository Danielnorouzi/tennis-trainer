import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { SessionDetail } from "./session-detail";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SessionDetail id={id} />
    </Suspense>
  );
}
