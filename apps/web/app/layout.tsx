import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-stack", display: "swap" });

export const metadata: Metadata = {
  title: "HIFZ AI — Agentic Security Firewall",
  description: "A firewall that inspects untrusted content before it can influence an AI agent.",
};

const NAV_LINKS = [
  { href: "/playground", label: "Playground" },
  { href: "/agent", label: "Agent demo" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/evaluation", label: "Evaluation" },
];

function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2 4 5.5v6c0 5.25 3.4 9.9 8 11.5 4.6-1.6 8-6.25 8-11.5v-6L12 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m9 12 2.2 2.2L15.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-ink">
              <span className="text-accent">
                <Mark />
              </span>
              HIFZ
              <span className="text-ink-faint">/ firewall</span>
            </Link>
            <nav className="flex items-center gap-5 text-[13px] text-ink-dim">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="transition-colors duration-150 hover:text-ink">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-14">{children}</main>
      </body>
    </html>
  );
}
