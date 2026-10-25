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
  const items = useMemo(
    () => ws.applications.filter((a) => result.decisions[a.id]).map((a) => ({ app: a, decision: result.decisions[a.id], stages: ws.stages[a.id] })),
    [ws.applications, ws.stages, result],
  );
  const { links, loading } = useStatusLinks(items, now);
  if (!ready) return <Loading />;
  const intro = "One ready message for every applicant, in their language. Copy it and send it. Each message includes their private status link.";
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
      {loading && <p className="mb-4 text-muted">Creating private status links…</p>}
      <div className="space-y-4">
        {items.map(({ app, decision }) => (
          <Card key={app.id} className="p-4">
            <button className="flex w-full flex-wrap items-center gap-3 text-left" aria-expanded={openId === app.id} onClick={() => setOpenId(openId === app.id ? null : app.id)}>
              <StatusStamp status={decision.status} flat />
              <span className="mono">{app.id}</span>
              <strong>{app.name || "Name not provided"}</strong>
              <span className="text-muted">{app.language}</span>
              <span className="ml-auto font-bold">{openId === app.id ? "Hide" : "Show message"}</span>
            </button>
            {openId === app.id && (
              <div className="mt-4 border-t-2 border-soft-line pt-4">
                <MessagePanel app={app} decision={decision} link={links[app.id]} now={now} />
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
