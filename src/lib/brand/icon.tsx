import { ImageResponse } from "next/og";

/** App icon rendered at build time (no binary assets in the repo). */
export function renderIcon(size: number, rounded = false) {
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #2f9a58 0%, #1f6f3d 100%)",
          borderRadius: rounded ? size * 0.22 : 0,
        }}
      >
        <svg width={size} height={size} viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
          <path d="M14 40c8-2 14-8 16-17M50 24c-8 2-14 8-16 17" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
