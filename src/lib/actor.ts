/** Who made a change. There is no sign-in yet, so this is the name the person chose, or "Team member". */
export function actorOf(req: Request): string {
  const raw = req.headers.get("x-actor") ?? "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep the raw text */
  }
  const clean = decoded.replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 40);
  return clean || "Team member";
}
