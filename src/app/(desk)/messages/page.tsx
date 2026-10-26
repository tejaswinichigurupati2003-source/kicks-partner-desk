"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { useStatusLinks } from "@/lib/links";
import { Card, EmptyState, ImportButton, Loading, PageHeader, StatusStamp } from "@/components/ui";
import { MessagePanel } from "@/components/MessagePanel";

export default function Messages() {
  const { ready, hasData, ws, result, now } = useDesk();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = useMemo(() => ws.applications.filter((a) => result.decisions[a.id]).map((a) => ({ app: a, decision: result.decisions[a.id] })), [ws.applications, result]);
  const { links, loading } = useStatusLinks();
  if (!ready) return <Loading />;
  const intro = "One ready message for every applicant, in their language. Copy it and send it. Each message ends with a short private link to their live status page.";
  if (!hasData)
    return (
      <>
        <PageHeader title="Messages" intro={intro} />
        <EmptyState title="No messages yet" text="Import applications and a message will be ready for each applicant." action={<ImportButton />} />
      </>
    );
  return (
    <>
      <PageHeader title="Messages" intro={intro} />
      {loading && <p className="mb-4 text-muted" role="status">Creating private status links…</p>}
      <div className="space-y-4">
        {items.map(({ app, decision }) => (
          <Card key={app.id} className="p-4">
            <button className="flex min-h-[44px] w-full flex-wrap items-center gap-3 text-left" aria-expanded={openId === app.id} onClick={() => setOpenId(openId === app.id ? null : app.id)}>
              <StatusStamp status={decision.status} flat />
              <span className="mono">{app.id}</span>
              <strong>{app.name || "Name not provided"}</strong>
              <span className="text-muted">{app.language}</span>
              <span className="ml-auto font-bold">{openId === app.id ? "Hide" : "Show message"}</span>
            </button>
            {openId === app.id && (
              <div className="mt-4 border-t-2 border-soft-line pt-4">
                <MessagePanel app={app} decision={decision} link={links[app.id]} now={now} assumptions={result.assumptions} />
                <p className="mt-3 text-sm">
                  <Link href={`/applications/${app.id}`}>Open the full profile</Link>
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
