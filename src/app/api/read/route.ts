import { NextResponse } from "next/server";
import { READS, type ReadName } from "./registry";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { name?: string; args?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const name = body.name as ReadName;
  if (!name || !Object.prototype.hasOwnProperty.call(READS, name) || !Array.isArray(body.args) || body.args.length > 4) {
    return NextResponse.json({ error: "Unknown read" }, { status: 400 });
  }
  try {
    const fn = READS[name] as (...a: unknown[]) => Promise<unknown>;
    const result = await fn(...body.args);
    return NextResponse.json({ result: result ?? null }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
