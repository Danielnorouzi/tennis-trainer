"use client";

import { ErrorState } from "@/components/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState body="This screen hit an unexpected problem. Your data is safe." onRetry={reset} />;
}
