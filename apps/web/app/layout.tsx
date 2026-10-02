import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Figtree, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "../components/site-header.js";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-stack", display: "swap" });

export const metadata: Metadata = {
  title: "HIFZ Firewall: is this safe for your AI to read?",
  description: "A firewall that inspects untrusted content before it can influence an AI agent.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <SiteHeader />
        <main className="mx-auto max-w-[1184px] px-5 py-12 sm:px-8 sm:py-16">{children}</main>
      </body>
    </html>
  );
}
