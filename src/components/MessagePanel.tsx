"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import { buildMessage, wordCount } from "@/engine/messages";
import type { Application, Decision, Language } from "@/engine/types";

const LANGS: Language[] = ["English", "Kannada", "Hindi"];

export function MessagePanel({ app, decision, link, now }: { app: Application; decision: Decision; link?: string; now: Date }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, lang: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(lang);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy this message:", text);
    }
  };
  return (
    <Tabs.Root defaultValue={app.language}>
      <Tabs.List className="mb-3 flex gap-2" aria-label="Message language">
        {LANGS.map((l) => (
          <Tabs.Trigger
            key={l}
            value={l}
            className="min-h-[44px] rounded-md border-2 border-ink px-4 font-bold data-[state=active]:bg-lime"
            style={{ background: "var(--surface)" }}
          >
            {l}
            {l === app.language ? " (applicant's)" : ""}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {LANGS.map((l) => {
        const text = buildMessage(app, decision, l, { now, link: link ?? "(link is being created…)" });
        return (
          <Tabs.Content key={l} value={l}>
            <div className="prose-msg indic rounded-md border-2 border-soft-line bg-box p-4" lang={l === "Kannada" ? "kn" : l === "Hindi" ? "hi" : "en"} style={{ overflowWrap: "anywhere" }}>
              {text}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn btn-small" onClick={() => copy(text, l)} disabled={!link}>
                {copied === l ? "Copied" : "Copy message"}
              </button>
              <span className="text-sm text-muted">{wordCount(text.replace(link ?? "", ""))} words</span>
              {l !== "English" && <span className="text-sm font-semibold" style={{ color: "#7a4a00" }}>Please have a native speaker check before sending.</span>}
            </div>
          </Tabs.Content>
        );
      })}
    </Tabs.Root>
  );
}
