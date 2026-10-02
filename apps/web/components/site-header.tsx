"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "./logo.js";

/**
 * The menu keeps the page names the README, deck and demo use, with one short plain-English line under each so a first-time
 * visitor (or a judge) can tell what the page is for. Captions are written to fit two lines.
 */
const MENU = [
  { href: "/playground", label: "Playground", caption: "Check any text, file or picture", icon: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /> },
  { href: "/agent", label: "Agent demo", caption: "Watch a protected email assistant", icon: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
  { href: "/scenarios", label: "Scenarios", caption: "The 7 attack types, replayed live", icon: <path d="M13 2L3 14h8l-1 8 10-12h-8z" /> },
  {
    href: "/reviews",
    label: "Reviews",
    caption: "People approve or reject held items",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M17 11l2 2 4-4" />
      </>
    ),
  },
  { href: "/dashboard", label: "Dashboard", caption: "Live counts from every check", icon: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /> },
  {
    href: "/evaluation",
    label: "Evaluation",
    caption: "Accuracy on tests it never saw",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
  },
] as const;

function MenuIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/playground" && pathname.startsWith("/events/"));

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1184px] items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:py-5">
        <Link href="/" aria-label="HIFZ Firewall, home" className="inline-flex min-h-11 items-center rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ink">
          <BrandLockup />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/playground"
            className="hidden h-13 items-center rounded-xl bg-accent px-6 text-lg font-bold text-ink transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink sm:inline-flex"
          >
            Check something
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-13 w-13 items-center justify-center rounded-xl border-2 border-line text-ink lg:hidden"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              {open ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      <nav aria-label="Main menu" className="hidden border-t border-line lg:block">
        <div className="mx-auto grid max-w-[1184px] grid-cols-6 px-8">
          {MENU.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col gap-1.5 border-b-4 px-4 pb-3.5 pt-4 transition-colors ${
                  active ? "border-accent bg-accent-tint" : "border-transparent hover:bg-accent-tint/60"
                }`}
              >
                <span className={`flex items-center gap-2.5 ${active ? "text-accent" : "text-ink-dim"}`}>
                  <MenuIcon className="shrink-0">{item.icon}</MenuIcon>
                  <span className="text-[19px] font-bold leading-tight text-ink">{item.label}</span>
                </span>
                <span className="line-clamp-2 h-10 text-[15px] leading-[1.35] text-ink-dim">{item.caption}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {open && (
        <nav id="mobile-menu" aria-label="Main menu" className="border-t border-line lg:hidden">
          {MENU.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[72px] items-start gap-4 border-b border-line px-5 py-4 ${active ? "bg-accent-tint" : "bg-surface"}`}
              >
                <MenuIcon className={`mt-0.5 shrink-0 ${active ? "text-accent" : "text-ink-dim"}`}>{item.icon}</MenuIcon>
                <span>
                  <span className="block text-[22px] font-bold leading-tight text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-[17px] leading-snug text-ink-dim">{item.caption}</span>
                </span>
              </Link>
            );
          })}
          <div className="px-5 py-6">
            <Link href="/playground" className="flex h-16 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-ink">
              Check something
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
