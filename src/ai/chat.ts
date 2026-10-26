import { fallbackChat, type ChatReply, type Pending } from "@/engine/assistant";
import { aiEnabled, chatCompletion, SYSTEM, type ChatMessage } from "./openrouter";
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

function savedSummary(ctx: ToolContext): string {
  const card = ctx.cards[ctx.cards.length - 1];
  return card ? `**Saved.** ${card.summary}` : "**Saved.**";
}

/**
 * Answers one message. Uses the language assistant when it is on, and the plain parser when it is off or fails.
 * Whatever is saved goes through the same save path, and the diff cards come back with the answer.
 */
export async function runChat(opts: { message: string; ctx: ToolContext; history: HistoryItem[]; pending?: Pending | null }): Promise<ChatReply & { ai: boolean }> {
  const { message, ctx, history, pending } = opts;
  if (aiEnabled()) {
    try {
      const text = await runWithTools(message, ctx, history);
      return { text, cards: ctx.cards, ai: true };
    } catch {
      // If something was already saved, report it instead of running the message again.
      if (ctx.saved) return { text: `${savedSummary(ctx)} I could not finish the explanation, so please check the card below.`, cards: ctx.cards, ai: true };
    }
  }
  const r = await fallbackChat(message, ctx, pending);
  return { ...r, ai: false };
}
