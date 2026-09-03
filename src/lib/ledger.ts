// Pure, deterministic settlement math for the per-event expense ledger.
// No global state, no LLM — integer cents in, "who owes whom" out.

export interface LineItem {
  id: string;
  /** The payer — the one who fronted the money and is therefore owed. */
  postedBy: string;
  description: string;
  amountCents: number;
  /** Participant profile ids who split this item. */
  sharedBy: string[];
}

export interface Debt {
  from: string;
  to: string;
  amountCents: number;
}

/**
 * Split an integer-cent amount equally among participants, allocating the
 * leftover pennies deterministically (to the first participants by sorted id) so
 * the shares ALWAYS sum back to exactly the amount — no phantom or missing cent.
 */
export function splitShares(amountCents: number, participants: string[]): Map<string, number> {
  const shares = new Map<string, number>();
  const n = participants.length;
  if (n === 0 || amountCents <= 0) {
    for (const p of participants) shares.set(p, 0);
    return shares;
  }
  const base = Math.floor(amountCents / n);
  let remainder = amountCents - base * n;
  for (const p of [...participants].sort()) {
    let share = base;
    if (remainder > 0) {
      share += 1;
      remainder -= 1;
    }
    shares.set(p, share);
  }
  return shares;
}

/**
 * Net every line item into a minimal set of pairwise debts. For each item the
 * payer is owed each other participant's share; debts between the same two
 * people (in both directions) cancel, leaving one net "from → to" per pair.
 */
export function computeSettlement(items: LineItem[]): Debt[] {
  // gross[`${debtor}|${creditor}`] = cents owed
  const gross = new Map<string, number>();
  for (const it of items) {
    if (it.amountCents <= 0 || it.sharedBy.length === 0) continue;
    const shares = splitShares(it.amountCents, it.sharedBy);
    for (const [person, share] of shares) {
      if (person === it.postedBy || share <= 0) continue; // you never owe yourself
      const key = `${person}|${it.postedBy}`;
      gross.set(key, (gross.get(key) ?? 0) + share);
    }
  }

  const done = new Set<string>();
  const debts: Debt[] = [];
  for (const key of gross.keys()) {
    const [a, b] = key.split("|");
    const pair = [a, b].sort().join("|");
    if (done.has(pair)) continue;
    done.add(pair);
    const net = (gross.get(`${a}|${b}`) ?? 0) - (gross.get(`${b}|${a}`) ?? 0);
    if (net > 0) debts.push({ from: a, to: b, amountCents: net });
    else if (net < 0) debts.push({ from: b, to: a, amountCents: -net });
  }
  return debts;
}
