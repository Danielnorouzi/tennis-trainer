import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Rally AI — Your personal tennis coach", template: "%s · Rally AI" },
  description: "Your personal tennis coach. Powered by AI. Live form analysis, video review, personalised drills and progress tracking.",
  applicationName: "Rally AI",
  appleWebApp: { capable: true, title: "Rally AI", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
  ],
};

// Applies the saved theme before first paint (no light/dark flash).
const themeScript = `(function(){try{var t=localStorage.getItem('rally.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;if(localStorage.getItem('rally.transparency')==='reduced')document.documentElement.dataset.transparency='reduced';}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
