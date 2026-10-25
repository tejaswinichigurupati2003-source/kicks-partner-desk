import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { body, display, hindi, kannada, mono } from "./fonts";
import { DeskProvider } from "@/lib/desk";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kicks Partner Desk", template: "%s · Kicks Partner Desk" },
  description: "Bring in franchise partner applications, see who gets an opening and why, and get every partner ready to open.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111111" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${kannada.variable} ${hindi.variable}`}>
      <body>
        <DeskProvider>
          {children}
        </DeskProvider>
      </body>
    </html>
  );
}
