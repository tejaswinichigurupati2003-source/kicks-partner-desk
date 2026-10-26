"use client";

import Link from "next/link";
import { useState } from "react";
import { STAGE_DEFS, type StageDef, type StageKey } from "@/engine/plans";
import type { Application, Decision } from "@/engine/types";

export interface BoardRow {
  a: Application;
  d: Decision;
  stages: StageDef[];
  current: StageDef | null;
  overdue: boolean;
  stuck: boolean;
}

const COLUMNS: { key: StageKey | "ready"; name: string }[] = [...STAGE_DEFS.map((s) => ({ key: s.key, name: s.name })), { key: "ready", name: "Ready to open" }];

/** Stage columns with cards that can be dragged between them, or moved with the menu on each card. */
export function StageBoard({ rows, onMove }: { rows: BoardRow[]; onMove: (row: BoardRow, target: StageKey | "ready") => string | null }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState(false);

  const move = (row: BoardRow, target: StageKey | "ready") => {
    const err = onMove(row, target);
    const name = COLUMNS.find((c) => c.key === target)?.name ?? target;
    setProblem(!!err);
    setMessage(err ?? `Moved ${row.a.id} to ${name}.`);
  };

  return (
    <div>
      <p className="mb-2 text-sm text-muted">Drag a card to another stage, or use the menu on the card. Earlier stages are marked done and the stage you pick is marked in progress.</p>
      <p role="status" aria-live="polite" className={`mb-2 min-h-[20px] text-sm font-semibold ${problem ? "text-danger" : ""}`}>
        {problem && <span aria-hidden="true">! </span>}
        {message}
      </p>
      <div className="mb-10 overflow-x-auto pb-3">
        <div className="flex min-w-max gap-4">
          {COLUMNS.map((c, i) => {
            const here = rows.filter((r) => (c.key === "ready" ? r.current === null : r.current?.key === c.key));
            const isOver = over === c.key && dragId !== null;
            return (
              <div
                key={c.key}
                className="w-[200px] shrink-0"
                onDragOver={(e) => {
                  if (dragId) e.preventDefault();
                }}
                onDragEnter={() => dragId && setOver(c.key)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === c.key ? null : o));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const row = rows.find((r) => r.a.id === (e.dataTransfer.getData("text/plain") || dragId));
                  setOver(null);
                  setDragId(null);
                  if (row && (c.key === "ready" ? row.current !== null : row.current?.key !== c.key)) move(row, c.key);
                }}
              >
                <h3 className="border-b-2 border-[#cdd6e6] pb-1 text-[15px] font-bold leading-tight">
                  {i + 1}. {c.name} <span className="mono text-sm">({here.length})</span>
                </h3>
                <ul
                  className="mt-2 min-h-[140px] space-y-2 rounded-xl p-1 transition-colors"
                  style={{ background: isOver ? "#e8efff" : undefined, outline: isOver ? "2px dashed #1f4fd8" : undefined }}
                  aria-label={`${c.name}: ${here.length} partner${here.length === 1 ? "" : "s"}`}
                >
                  {here.map((r) => (
                    <li
                      key={r.a.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", r.a.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(r.a.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      className={`card p-2 text-sm tint-${r.d.status}`}
                      style={{ cursor: "grab", opacity: dragId === r.a.id ? 0.45 : 1, boxShadow: r.overdue ? "0 0 0 2px var(--error)" : undefined }}
                    >
                      <div className="flex items-start gap-2">
                        <span aria-hidden="true" className="select-none text-muted">
                          ⠿
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/applications/${r.a.id}`} className="no-underline" draggable={false}>
                            <span className="mono font-bold">{r.a.id}</span> {r.a.name}
                          </Link>
                          <br />
                          <span className="text-muted">{r.a.city}</span>
                          {r.overdue && <span className="block font-bold text-danger">! Overdue</span>}
                          {r.stuck && <span className="block font-bold text-danger">! Stuck</span>}
                        </div>
                      </div>
                      <label className="sr-only" htmlFor={`move-${r.a.id}`}>
                        Move {r.a.id} to a stage
                      </label>
                      <select
                        id={`move-${r.a.id}`}
                        className="field mt-2 !min-h-[44px] !py-1 text-sm"
                        value={r.current?.key ?? "ready"}
                        onChange={(e) => move(r, e.target.value as StageKey | "ready")}
                      >
                        {r.stages.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.name}
                          </option>
                        ))}
                        <option value="ready">Ready to open</option>
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
