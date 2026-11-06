/** Operator-only: credentials must remain outside NEXT_PUBLIC_* and source control. */
import { createClient } from "@supabase/supabase-js";

const [command, email, orgName, orgType] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || new URL(url).origin !== "https://vhcdzonkgalpcozbhmmj.supabase.co" || !key) {
  throw new Error("Set SEER's SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the operator environment.");
}
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["invite", "provision"].includes(command)) {
  throw new Error("Usage: tsx scripts/onboard-admin.ts invite EMAIL | provision EMAIL ORGANIZATION_NAME school|nursery|kindergarten");
}
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
if (command === "invite") {
  const origin = process.env.SEER_APP_ORIGIN;
  if (!origin || !["https://seer-app-psi.vercel.app"].includes(new URL(origin).origin)) {
    throw new Error("Set SEER_APP_ORIGIN to the verified SEER production origin.");
  }
  const { error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo: new URL("/auth/setup", origin).href });
  if (error) throw new Error("Invitation failed. Check the Auth dashboard and email delivery settings.");
  console.log("Administrator invitation requested. The recipient must verify the email and set their own password.");
} else {
  if (!orgName?.trim() || orgName.trim().length > 120 || !["school", "nursery", "kindergarten"].includes(orgType)) {
    throw new Error("Provide an organization name (1–120 characters) and supported type.");
  }
  let userId: string | undefined;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error("Could not verify the administrator.");
    const user = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      if (!user.email_confirmed_at) throw new Error("The administrator must verify their email before provisioning.");
      userId = user.id;
      break;
    }
    if (data.users.length < 100) break;
  }
  if (!userId) throw new Error("No verified administrator found.");
  const { count, error: membershipError } = await client.from("memberships").select("organization_id", { count: "exact", head: true }).eq("user_id", userId);
  if (membershipError || count !== 0) throw new Error("Administrator lookup failed or already has a membership; review manually to avoid duplicate provisioning.");
  const { error } = await client.rpc("bootstrap_organization", { admin_user: userId, org_name: orgName.trim(), org_type: orgType });
  if (error) throw new Error("Provisioning failed; verify that the reviewed operations migration is applied.");
  console.log("Organization and owner membership created atomically with an audit event.");
}
