import { fallbackChat, type ChatReply, type Pending } from "@/engine/assistant";
import { aiEnabled, chatCompletion, SYSTEM, type ChatMessage } from "./openrouter";
import { humanise } from "@/engine/labels";
import { oneLineReply } from "@/lib/diffcard";
import { executeTool, TOOL_SPECS, type ToolContext } from "./tools";

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

const MAX_STEPS = 6;

/** The language assistant with tools. Throws if it cannot answer, so the caller can use the fallback. */
async function runWithTools(message: string, ctx: ToolContext, history: HistoryItem[]): Promise<string> {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM }, ...history.slice(-10).map((h): ChatMessage => ({ role: h.role, content: h.content })), { role: "user", content: message }];
  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await chatCompletion(messages, TOOL_SPECS);
    const calls = reply.tool_calls ?? [];
    if (calls.length === 0) {
      const text = (reply.content ?? "").trim();
      if (!text) throw new Error("ai_empty");
      return text;
    }
    messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        /* the tool will report what is missing */
      }
      const out = await executeTool(ctx, call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out).slice(0, 12_000) });
    }
  }
  throw new Error("ai_steps");
}

/** A question about something that has not happened: it is answered with a preview and never saved. */
export function isHypothetical(message: string): boolean {
  return /\b(what if|what happens if|what would happen|what will happen|suppose|supposing|imagine|hypothetical(ly)?|say we|if we (raise|lower|change|increase|decrease|set|add|remove|cut|drop|move)|if (we|i) were to)\b/i.test(message) || /\bwould (it|that|this|anyone|anybody|any|the)\b[^.?]*\bchange\b/i.test(message);
}

/** The reply when cards are shown: one line per card, built from the card itself so it can't disagree with it. */
export function cardReply(ctx: ToolContext): string | null {
  if (ctx.cards.length === 0) return null;
  return ctx.cards.map(oneLineReply).join("\n");
}

function savedSummary(ctx: ToolContext): string {
  return cardReply(ctx) ?? "**Saved.**";
}

/**
 * Answers one message. Uses the language assistant when it is on, and the plain parser when it is off or fails.
 * Whatever is saved goes through the same save path, and the diff cards come back with the answer.
 */
export async function runChat(opts: { message: string; ctx: ToolContext; history: HistoryItem[]; pending?: Pending | null }): Promise<ChatReply & { ai: boolean }> {
  const { message, ctx, history, pending } = opts;
  if (isHypothetical(message)) ctx.forcePreview = true;
  if (aiEnabled()) {
    try {
      const text = await runWithTools(message, ctx, history);
      return { text: cardReply(ctx) ?? humanise(text), cards: ctx.cards, ai: true };
    } catch {
      // If something was already saved, report it instead of running the message again.
      if (ctx.cards.length > 0) return { text: savedSummary(ctx), cards: ctx.cards, ai: true };
    }
  }
  const r = await fallbackChat(message, ctx, pending);
  return { ...r, ai: false };
}
