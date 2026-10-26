"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useDesk } from "@/lib/desk";
import { useAlerts } from "@/lib/alerts";
import { STATUS_LABEL } from "@/engine/run";
import type { Status } from "@/engine/types";
import { Wordmark } from "./ui";
import { Assistant } from "./Assistant";

const ICONS: Record<string, string> = {
  overview: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  board: "M4 4h16v4H4zM4 10h10v4H4zM4 16h16v4H4z",
  import: "M12 3v12M7 10l5 5 5-5M4 20h16",
  apps: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  areas: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  market: "M4 19V9M10 19V5M16 19v-8M22 19H2",
  onboarding: "M5 12l5 5 9-10",
  review: "M9 11l3 3 8-8M4 5h9M4 11h3M4 17h9",
  messages: "M4 5h16v11H8l-4 4z",
  insights: "M3 17l6-6 4 4 8-9",
  start: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.3l1-6.2L3 9.7l6.2-.9z",
  stores: "M4 10l1-5h14l1 5M5 10v9h14v-9M9 19v-5h6v5",
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const MENU = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/board", label: "Decision board", icon: "board" },
  { href: "/applications", label: "Applications", icon: "apps" },
  { href: "/shortlist", label: "Start here", icon: "start" },
  { href: "/messages", label: "Messages", icon: "messages" },
];
const WORK = [
  { href: "/import", label: "Import", icon: "import" },
  { href: "/areas", label: "Areas", icon: "areas" },
  { href: "/market", label: "Market", icon: "market" },
  { href: "/onboarding", label: "Onboarding", icon: "onboarding" },
  { href: "/data-review", label: "Data review", icon: "review" },
  { href: "/insights", label: "Insights", icon: "insights" },
  { href: "/stores", label: "Our stores", icon: "stores" },
];
const STATUSES: Status[] = ["approved", "conditional", "needs_info", "waiting", "not_eligible"];

function titleFor(path: string): string {
  if (path === "/") return "Overview";
  if (path.startsWith("/applications/")) return "Applicant";
  const hit = [...MENU, ...WORK].find((n) => n.href !== "/" && path.startsWith(n.href));
  return hit?.label ?? "Kicks Partner Desk";
}

function Nav({ items, active }: { items: typeof MENU; active: (href: string) => boolean }) {
  return (
    <ul className="space-y-1">
      {items.map((n) => (
        <li key={n.href}>
          <Link href={n.href} className="nav-item" aria-current={active(n.href) ? "page" : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { result, hasData } = useDesk();
  const [q, setQ] = useState("");
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const decisions = Object.values(result.decisions);
  const count = (s: Status) => decisions.filter((d) => d.status === s).length;
  const { alerts, unread, isUnread, markRead } = useAlerts();

  const search = (e: FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/applications?q=${encodeURIComponent(q.trim())}` : "/applications");
  };

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-3 focus:font-bold">
        Skip to content
      </a>
      <div className="mx-auto flex min-h-screen max-w-[1500px] gap-5 p-3 lg:p-5">
        <aside className="card sticky top-5 hidden h-[calc(100vh-40px)] w-[250px] shrink-0 flex-col overflow-y-auto p-4 lg:flex" aria-label="Sidebar">
          <Link href="/" aria-label="Kicks Partner Desk, home" className="mb-5 px-1 pt-1 no-underline">
            <Wordmark size={34} />
            <span className="mt-1 block text-xs font-semibold tracking-wide text-muted">Partner Desk</span>
          </Link>
          <nav aria-label="Main">
            <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-muted">Menu</p>
            <Nav items={MENU} active={active} />
            <p className="mb-2 mt-5 px-3 text-xs font-bold uppercase tracking-wider text-muted">By decision</p>
            <ul className="space-y-1">
              {STATUSES.map((s) => (
                <li key={s}>
                  <Link href={`/applications?status=${s}`} className="nav-item !min-h-[40px]">
                    <span className={`dot dot-${s}`} aria-hidden="true" />
                    <span className="flex-1 text-[14px]">{STATUS_LABEL[s]}</span>
                    <span className="mono text-sm text-muted">{hasData ? count(s) : 0}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mb-2 mt-5 px-3 text-xs font-bold uppercase tracking-wider text-muted">Workspace</p>
            <Nav items={WORK} active={active} />
          </nav>
          <div className="mt-auto pt-5">
            <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(160deg,#1f4fd8,#12306b)" }}>
              <p className="font-bold leading-snug">Ready to bring in more partners?</p>
              <Link href="/import" className="mt-3 flex min-h-[44px] items-center justify-center rounded-xl bg-white font-bold no-underline" style={{ color: "#12306b" }}>
                Import applications
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="card mb-5 flex flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
            <Link href="/" className="lg:hidden" aria-label="Kicks Partner Desk, home">
              <Wordmark size={28} />
            </Link>
            <p className="mr-auto text-[20px] font-bold tracking-tight max-lg:sr-only">{titleFor(path)}</p>
            <form onSubmit={search} role="search" className="relative min-w-[200px] max-w-[420px] flex-1">
              <label htmlFor="global-search" className="sr-only">
                Search applications
              </label>
              <input id="global-search" className="field !pl-10" placeholder="Search by name, number, city or pin code" value={q} onChange={(e) => setQ(e.target.value)} />
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
            </form>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-[#cdd6e6] bg-white text-ink" aria-label={`Notifications: ${unread.length} unread`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0" />
                  </svg>
                  {unread.length > 0 && <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-[#dc2626] px-1 text-center text-xs font-bold text-white">{unread.length}</span>}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="end" sideOffset={8} className="card z-50 w-[min(92vw,380px)] p-3">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <p className="font-bold">Notifications</p>
                    <button className="min-h-[44px] px-2 text-sm font-semibold text-cobalt disabled:text-muted" disabled={unread.length === 0} onClick={() => markRead(alerts.map((a) => a.key))}>
                      Mark all as read
                    </button>
                  </div>
                  {alerts.length === 0 ? (
                    <p className="rounded-xl border border-soft-line p-4 text-sm text-muted">{hasData ? "Nothing needs attention right now." : "Import applications to see what needs attention."}</p>
                  ) : (
                    <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
                      {alerts.map((a) => (
                        <li key={a.key}>
                          <Popover.Close asChild>
                            <Link href={a.href} onClick={() => markRead([a.key])} className={`block rounded-xl border p-3 no-underline tint-${a.tone}`} style={{ color: "inherit" }}>
                              <span className="flex items-center gap-2 font-bold">
                                <span className={`dot dot-${a.tone}`} aria-hidden="true" />
                                {a.title}
                                {isUnread(a) && <span className="ml-auto rounded-full bg-[#dc2626] px-2 text-[11px] font-bold text-white">New</span>}
                              </span>
                              <span className="mt-1 block text-sm text-[#3b4558]">{a.text}</span>
                            </Link>
                          </Popover.Close>
                        </li>
                      ))}
                    </ul>
                  )}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <div className="flex items-center gap-3 border-l border-soft-line pl-4 max-sm:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8efff] font-bold" style={{ color: "#12306b" }} aria-hidden="true">
                E
              </span>
              <span className="leading-tight">
                <strong className="block text-[14px]">Expansion team</strong>
                <span className="text-xs text-muted">Kicks Partner Desk</span>
              </span>
            </div>
          </header>
          <main id="main" className="pb-28 lg:pb-8">
            {children}
          </main>
        </div>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-soft-line bg-white lg:hidden">
        {[...MENU, ...WORK].map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className="flex min-h-[56px] shrink-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap px-3 text-[11px] font-semibold no-underline"
            style={{ boxShadow: active(n.href) ? "inset 0 3px 0 var(--cobalt)" : undefined, color: active(n.href) ? "#12306b" : "#3b4558" }}
          >
            <Icon name={n.icon} />
            {n.label}
          </Link>
        ))}
      </nav>
      <Assistant />
    </>
  );
}
