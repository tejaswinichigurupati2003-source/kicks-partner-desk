import { Big_Shoulders, Hanken_Grotesk, IBM_Plex_Mono, Noto_Sans_Devanagari, Noto_Sans_Kannada } from "next/font/google";

export const display = Big_Shoulders({ subsets: ["latin"], weight: ["800", "900"], variable: "--font-display", display: "swap" });
export const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body", display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
export const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-kn", display: "swap" });
export const hindi = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-hi", display: "swap" });
