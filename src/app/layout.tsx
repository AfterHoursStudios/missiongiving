import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { publicEnv } from "@/lib/env";

const display = Fraunces({ variable: "--font-display", subsets: ["latin"] });
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: { default: "Mission Giving | Ultimate Mission", template: "%s | Mission Giving" },
  description: "Give hope. Empower women. Save lives. Support Ultimate Mission's community health workers.",
  openGraph: { siteName: "Mission Giving", type: "website" },
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen flex flex-col">
        <a href="#main" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
