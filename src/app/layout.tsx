import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_BOOT_SCRIPT, THEME_COOKIE, parseThemePref } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "FleetOps", template: "%s · FleetOps" },
  description: "Dispatch, fleet, tracking and finance in one control tower.",
};

// Day is the default theme whatever the device prefers, so the browser chrome matches the Day canvas.
export const viewport: Viewport = { themeColor: "#f4f5f7" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value);
  return (
    // "auto" is resolved by the boot script before first paint, so the attribute may be set client-side.
    <html lang="en" data-theme={pref === "auto" ? undefined : pref} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
