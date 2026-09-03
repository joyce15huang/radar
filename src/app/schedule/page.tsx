import Link from "next/link";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { AvailabilityGrid, type GridCol, type GridRow } from "@/components/AvailabilityGrid";
import { slotId, type Avail, type Participant } from "@/lib/schedule";

/**
 * Group-scheduling — STEP 1 demo (frontend only, deterministic mock data).
 * Paint your availability, flip to Group to see the weighted heatmap + best
 * time. Step 2 replaces the inline ranking with the tested `calculateOptimalTime`
 * optimizer; step 3 wires real participants through Supabase.
 */

const DAY_COUNT = 5;
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function hourLabel(h: number): string {
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function buildDays(): GridCol[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const cols: GridCol[] = [];
  for (let i = 0; i < DAY_COUNT; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    cols.push({
      key: `d${i}`,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      sub: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }
  return cols;
}

const TIMES: GridRow[] = HOURS.map((h) => ({ key: `t${h}`, label: hourLabel(h) }));

/** Build a participant from a deterministic (day,time)→stance function. */
function make(id: string, name: string, weight: number, fn: (d: number, t: number) => Avail): Participant {
  const avail: Record<string, Avail> = {};
  for (let d = 0; d < DAY_COUNT; d++) {
    for (let t = 0; t < HOURS.length; t++) {
      const a = fn(d, t);
      if (a) avail[slotId(d, t)] = a;
    }
  }
  return { id, name, weight, avail };
}

// A handful of mock people with distinct rhythms, so the heatmap has a clear
// winner in the shared evening band.
const OTHERS: Participant[] = [
  make("alice", "Alice", 1, (d, t) => (t >= 4 && d !== 2 ? 2 : t >= 2 ? 1 : 0)),
  make("ben", "Ben", 2, (d, t) => (t >= 6 ? 2 : t >= 5 ? 1 : 0)), // host — counts double
  make("cara", "Cara", 1, (d, t) => (d <= 2 ? (t >= 3 ? 2 : 1) : 0)),
  make("dan", "Dan", 1, (d, t) => ([6, 7, 8, 9].includes(t) ? 2 : t === 5 ? 1 : 0)),
];

export default function SchedulePage() {
  const days = buildDays();
  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <Link
          href="/calendar"
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" /> Calendar
        </Link>

        <header className="mb-5">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            <CalendarClock className="h-6 w-6 text-neutral-400" />
            Find a time
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Paint when you&rsquo;re free, then switch to <span className="font-medium">Group</span> to see everyone&rsquo;s
            overlap and the best time to meet. Key people count for more.
          </p>
        </header>

        <AvailabilityGrid days={days} times={TIMES} meId="me" meName="You" others={OTHERS} />
      </div>
    </main>
  );
}
