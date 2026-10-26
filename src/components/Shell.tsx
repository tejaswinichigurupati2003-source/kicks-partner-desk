"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDesk } from "@/lib/desk";
import { Wordmark } from "./ui";
import { Assistant } from "./Assistant";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/board", label: "Board" },
  { href: "/import", label: "Import" },
  { href: "/applications", label: "Applications" },
  { href: "/areas", label: "Areas" },
  { href: "/market", label: "Market" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/data-review", label: "Data review" },
  { href: "/shortlist", label: "Start here" },
  { href: "/messages", label: "Messages" },
  { href: "/insights", label: "Insights" },
];

function Ticker() {
  const { result, hasData, ws } = useDesk();
  const facts: string[] = [];
  if (!hasData) facts.push("IMPORT YOUR APPLICATIONS TO SEE WHAT NEEDS ATTENTION", `${ws.stores.length} STORES OPEN TODAY`, "ONE STORE PER PIN CODE");
  else {
    const d = Object.values(result.decisions);
    const n = (s: string) => d.filter((x) => x.status === s).length;
    facts.push(`${d.length} APPLICATIONS`, `${n("approved") + n("conditional")} APPROVED`, `${n("needs_info")} NEED INFORMATION`, `${n("waiting")} ON THE WAITING LIST`);
    for (const t of result.territories) if (t.territory.slots > 0 && t.openingsLeft === 0) facts.push(`${t.territory.city.toUpperCase()} ${t.territory.id} IS FULL`);
  }
  const line = facts.join("  ·  ") + "  ·  ";
  return (
    <div className="ticker overflow-hidden border-b-2 border-ink bg-lime py-1.5 text-sm font-bold uppercase tracking-wide" aria-label={facts.join(", ")} role="status">
      <div className="ticker-track" aria-hidden="true">
        <span>{line}</span>
        <span>{line}</span>
        <span>{line}</span>
        <span>{line}</span>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-lime focus:p-3 focus:font-bold">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 bg-ink text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Kicks Partner Desk, home" className="py-2">
            <Wordmark light size={34} />
          </Link>
          <nav aria-label="Main" className="hidden flex-1 items-stretch gap-1 overflow-x-auto lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className="font-display-up flex min-h-[56px] items-center whitespace-nowrap px-3 text-[19px] tracking-wider text-white no-underline hover:text-lime"
                style={{ boxShadow: active(n.href) ? "inset 0 -6px 0 var(--lime)" : undefined }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="font-display-up ml-auto hidden text-sm tracking-widest text-white/70 xl:block">Partner Desk</span>
        </div>
        <Ticker />
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 pb-32 pt-8 sm:px-6 lg:pb-16">
        {children}
      </main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t-2 border-ink bg-ink lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className="font-display-up flex min-h-[56px] shrink-0 items-center whitespace-nowrap px-4 text-[17px] tracking-wider text-white no-underline"
            style={{ boxShadow: active(n.href) ? "inset 0 4px 0 var(--lime)" : undefined }}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <Assistant />
    </>
  );
}
