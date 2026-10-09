// Creates two test accounts (Ada + Ben) you can invite, already friends with you.
//
//   node scripts/create-test-users.mjs you@gmail.com
//
// Emails use plus-addressing (you+ada@gmail.com) so any mail lands in YOUR inbox.
// Safe to re-run: existing test users get their password reset and friendship re-checked.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const me = (process.argv[2] ?? "").trim().toLowerCase();
if (!me.includes("@")) {
  console.error("Usage: node scripts/create-test-users.mjs you@example.com");
  process.exit(1);
}

// Minimal .env.local reader (no dotenv dependency).
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [local, domain] = me.split("@");
const TEST = [
  { tag: "ada", username: "ada_test", name: "Ada (test)" },
  { tag: "ben", username: "ben_test", name: "Ben (test)" },
];

const { data: myProfile, error: meErr } = await admin.from("profiles").select("id, username").eq("email", me).maybeSingle();
if (meErr || !myProfile) {
  console.error(`Couldn't find your profile for ${me}. Sign in to the app once first.`, meErr?.message ?? "");
  process.exit(1);
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const out = [];
for (const t of TEST) {
  const email = `${local}+${t.tag}@${domain}`;
  const password = `Digest-${t.tag}-${randomBytes(3).toString("hex")}`;

  let user = await findUserByEmail(email);
  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }

  // The signup trigger creates the profile; give it a username so it skips onboarding.
  const { error: pErr } = await admin
    .from("profiles")
    .update({ username: t.username, display_name: t.name })
    .eq("id", user.id);
  if (pErr) throw new Error(`profile ${t.username}: ${pErr.message}`);

  // Friends with you (accepted), unless already connected.
  const { data: rel } = await admin
    .from("friendships")
    .select("id, status")
    .or(
      `and(requester_id.eq.${myProfile.id},addressee_id.eq.${user.id}),and(requester_id.eq.${user.id},addressee_id.eq.${myProfile.id})`,
    );
  if (!rel?.length) {
    const { error } = await admin.from("friendships").insert({
      requester_id: myProfile.id,
      addressee_id: user.id,
      status: "accepted",
      responded_at: new Date().toISOString(),
    });
    if (error) throw new Error(`friendship ${t.username}: ${error.message}`);
  } else if (rel[0].status !== "accepted") {
    await admin.from("friendships").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", rel[0].id);
  }

  out.push({ username: `@${t.username}`, email, password });
}

console.log(`\nTest accounts ready — both are friends with ${myProfile.username ? "@" + myProfile.username : me}:\n`);
console.table(out);
console.log("Sign in on the login page with email + password (use a private window to stay logged in as yourself).\n");
