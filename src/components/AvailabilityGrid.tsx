"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Users, Pencil, Eraser } from "lucide-react";
import {
  type Avail,
  type Participant,
  slotId,
  scoreGrid,
  bestSlots,
} from "@/lib/schedule";

export interface GridCol {
  key: string;
  label: string;
  sub?: string;
}
export interface GridRow {
  key: string;
  label: string;
}

const BRUSHES: { value: Avail; label: string; dot: string }[] = [
  { value: 2, label: "Free", dot: "bg-emerald-500" },
  { value: 1, label: "If need be", dot: "bg-amber-400" },
  { value: 0, label: "Busy", dot: "bg-neutral-300 dark:bg-neutral-600" },
];

/** Emerald fill whose opacity tracks the slot's share of the max score. */
function heatStyle(ratio: number): React.CSSProperties {
  if (ratio <= 0) return {};
  return { backgroundColor: `rgba(16, 185, 129, ${0.12 + 0.8 * ratio})` };
}

/**
 * The availability grid: paint your own free / if-need-be / busy slots, then
 * flip to the group view to see the weighted heatmap and the best time. Pure
 * client UI over the scheduling core; no backend yet (step 3 wires it up).
 */
export function AvailabilityGrid({
  days,
  times,
  meId,
  meName,
  others,
}: {
  days: GridCol[];
  times: GridRow[];
  meId: string;
  meName: string;
  others: Participant[];
}) {
  const [view, setView] = useState<"me" | "group">("me");
  const [brush, setBrush] = useState<Avail>(2);
  const [mine, setMine] = useState<Record<string, Avail>>({});
  const painting = useRef(false);

  const me: Participant = useMemo(
    () => ({ id: meId, name: meName, weight: 1, avail: mine }),
    [meId, meName, mine],
  );
  const all = useMemo(() => [me, ...others], [me, others]);

  const scores = useMemo(
    () => scoreGrid(all, days.length, times.length),
    [all, days.length, times.length],
  );
  const scoreAt = useCallback(
    (d: number, t: number) => scores[d * times.length + t],
    [scores, times.length],
  );
  const best = useMemo(() => bestSlots(scores, 1)[0] ?? null, [scores]);
  const bestKey = best ? slotId(best.day, best.time) : null;

  const paint = useCallback(
    (id: string) => setMine((prev) => (prev[id] === brush ? prev : { ...prev, [id]: brush })),
    [brush],
  );

  useEffect(() => {
    const stop = () => {
      painting.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  function onGridPointerMove(e: React.PointerEvent) {
    if (!painting.current || view !== "me") return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const id = el?.dataset?.slot;
    if (id) paint(id);
  }

  const mineCount = Object.values(mine).filter((v) => v === 2).length;
  const gridCols = `2.75rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-neutral-200 p-0.5 text-xs font-medium dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setView("me")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
              view === "me"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            }`}
          >
            <Pencil className="h-3.5 w-3.5" /> My availability
          </button>
          <button
            type="button"
            onClick={() => setView("group")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
              view === "group"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            }`}
          >
            <Users className="h-3.5 w-3.5" /> Group ({all.length})
          </button>
        </div>
        {view === "me" && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">{mineCount} free</span>
        )}
      </div>

      {/* Best-time banner (group view) */}
      {view === "group" && best && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-400/20 dark:bg-emerald-500/10">
          <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
          <span className="text-emerald-800 dark:text-emerald-200">
            Best time:{" "}
            <span className="font-semibold">
              {days[best.day].label} {times[best.time].label}
            </span>{" "}
            — {best.freeCount} of {all.length} free
            {best.maybeCount > 0 ? `, ${best.maybeCount} if needed` : ""}
          </span>
        </div>
      )}

      {/* Brush picker (me view) */}
      {view === "me" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">Paint:</span>
          {BRUSHES.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setBrush(b.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                brush === b.value
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${b.dot}`} />
              {b.label}
            </button>
          ))}
          {mineCount > 0 && (
            <button
              type="button"
              onClick={() => setMine({})}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-neutral-400 transition hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
            >
              <Eraser className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      )}

      {/* The grid */}
      <div className="overflow-x-auto">
        <div
          className="min-w-[20rem] select-none"
          style={{ touchAction: view === "me" ? "none" : "auto" }}
          onPointerMove={onGridPointerMove}
        >
          {/* Day header */}
          <div className="grid gap-1" style={{ gridTemplateColumns: gridCols }}>
            <div />
            {days.map((d) => (
              <div key={d.key} className="pb-1 text-center">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">{d.label}</div>
                {d.sub && <div className="text-[0.65rem] text-neutral-400 dark:text-neutral-500">{d.sub}</div>}
              </div>
            ))}
          </div>

          {/* Time rows */}
          {times.map((row, t) => (
            <div key={row.key} className="grid items-stretch gap-1 pb-1" style={{ gridTemplateColumns: gridCols }}>
              <div className="flex items-center justify-end pr-1 text-[0.65rem] text-neutral-400 dark:text-neutral-500">
                {row.label}
              </div>
              {days.map((d, dayIdx) => {
                const id = slotId(dayIdx, t);
                if (view === "me") {
                  const a = mine[id] ?? 0;
                  const cls =
                    a === 2
                      ? "bg-emerald-500/90"
                      : a === 1
                        ? "bg-amber-400/90"
                        : "bg-neutral-100 dark:bg-neutral-800";
                  return (
                    <button
                      key={id}
                      type="button"
                      data-slot={id}
                      onPointerDown={() => {
                        painting.current = true;
                        paint(id);
                      }}
                      className={`h-7 rounded-md transition-colors ${cls}`}
                      aria-label={`${d.label} ${row.label}`}
                    />
                  );
                }
                const s = scoreAt(dayIdx, t);
                const ratio = s.max > 0 ? s.score / s.max : 0;
                const isBest = id === bestKey;
                return (
                  <div
                    key={id}
                    data-slot={id}
                    title={s.free.length ? `Free: ${s.free.join(", ")}` : "Nobody free"}
                    style={heatStyle(ratio)}
                    className={`flex h-7 items-center justify-center rounded-md text-[0.6rem] font-medium ${
                      ratio <= 0 ? "bg-neutral-100 dark:bg-neutral-800" : ""
                    } ${
                      isBest
                        ? "ring-2 ring-emerald-500 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900"
                        : ""
                    }`}
                  >
                    {s.freeCount > 0 && (
                      <span className={ratio > 0.55 ? "text-white" : "text-neutral-500 dark:text-neutral-300"}>
                        {s.freeCount}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        {view === "me" ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Free
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> If need be
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-neutral-200 dark:bg-neutral-700" /> Busy
            </span>
            <span className="text-neutral-400 dark:text-neutral-500">· tap or drag to paint</span>
          </>
        ) : (
          <>
            <span>Darker = more people free (weighted)</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-emerald-500" /> best time
            </span>
            <span className="text-neutral-400 dark:text-neutral-500">· number = people free</span>
          </>
        )}
      </div>
    </div>
  );
}
