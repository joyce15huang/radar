// Client helper: call a read-only server function without blocking navigation.
// See src/app/api/read/registry.ts for why this exists.
import type { READS } from "@/app/api/read/registry";

type Reads = typeof READS;

export async function readApi<K extends keyof Reads>(
  name: K,
  ...args: Parameters<Reads[K]>
): Promise<Awaited<ReturnType<Reads[K]>>> {
  const res = await fetch("/api/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, args }),
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`read ${String(name)} failed`);
  const json = (await res.json()) as { result: Awaited<ReturnType<Reads[K]>> };
  return json.result;
}
