import { renderIcon } from "@/lib/brand/icon";

export const dynamic = "force-static";

export function GET() {
  return renderIcon(512);
}
