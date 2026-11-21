import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { BACKUP_BUCKET, LATEST_MIGRATION, expiredFolders, gzipRows, sha256 } from "../lib/backup";
import { backupFresh, formatBytes, formatDuration, isViewSection, queueState, supabaseDashboard, waitText } from "../lib/admin-stage4";
import { adminNavFor } from "../lib/admin-nav";
import { auditLabel } from "../lib/admin-format";

describe("backups", () => {
  it("the latest migration constant follows the newest migration file", () => {
    const newest = readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).sort().at(-1)!;
    expect(`${LATEST_MIGRATION}.sql`).toBe(newest);
  });
  it("gzip JSON page by page, readable back, with a stable sha256", () => {
    const { body, rows } = gzipRows([[{ id: 1, name: "ريان" }], [{ id: 2, name: "جود" }], []]);
    expect(rows).toBe(2);
    expect(JSON.parse(gunzipSync(body).toString("utf8"))).toEqual([{ id: 1, name: "ريان" }, { id: 2, name: "جود" }]);
    expect(sha256(body)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(gunzipSync(gzipRows([]).body).toString())).toEqual([]);
  });
  it("keeps 30 days and deletes older date folders only", () => {
    expect(expiredFolders(["2026-10-20", "2026-10-25", "2026-11-23", "notes", "2026-10-24"], "2026-11-24")).toEqual(["2026-10-20", "2026-10-24"]);
  });
  it("the restore script checks sha256 and row counts, then writes SQL per table", () => {
    const dir = mkdtempSync(join(tmpdir(), "seer-backup-"));
    const children = gzipRows([[{ id: "a", full_name: "ريان" }]]);
    const users = gzipRows([[{ id: "u1", email: "x@y.test" }]]);
    writeFileSync(join(dir, "public.children.json.gz"), children.body);
    writeFileSync(join(dir, "auth.users.json.gz"), users.body);
    const manifest = { files: [{ name: "public.children.json.gz", rows: 1, sha256: sha256(children.body) }, { name: "auth.users.json.gz", rows: 1, sha256: sha256(users.body) }] };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    const out = join(dir, "sql");
    execFileSync("node", ["scripts/restore-backup.mjs", dir, out]);
    const sql = readFileSync(join(out, "public.children.sql"), "utf8");
    expect(sql).toContain('insert into public."children" select * from jsonb_populate_recordset(null::public."children"');
    expect(sql).toContain("ريان");
    expect(JSON.parse(readFileSync(join(out, "auth.users.json"), "utf8"))).toEqual([{ id: "u1", email: "x@y.test" }]);
    // A changed file is refused.
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ files: [{ ...manifest.files[0], sha256: "0".repeat(64) }] }));
    expect(() => execFileSync("node", ["scripts/restore-backup.mjs", dir, out], { stdio: "pipe" })).toThrow();
  });
  it("the daily cron runs on the platform project, and the route needs CRON_SECRET", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toEqual([{ path: "/api/backups/run", schedule: "30 0 * * *" }]);
    const route = readFileSync("app/api/backups/run/route.ts", "utf8");
    expect(route).toContain("sameSecret(request.headers.get(\"authorization\") ?? \"\", `Bearer ${secret}`)");
    expect(route).toContain("if (!secret ||");
    expect(BACKUP_BUCKET).toBe("platform-backups");
  });
  it("auth users are exported without password hashes", () => {
    const source = readFileSync("lib/backup.ts", "utf8");
    const users = source.slice(source.indexOf("async function readUsers"), source.indexOf("async function put"));
    expect(users).not.toMatch(/encrypted_password|password|identities|factors/);
  });
  it("the migration adds no storage policy, and keeps the server functions to the service role", () => {
    const sql = readFileSync("supabase/migrations/20261124090000_admin_stage4.sql", "utf8");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toContain("values ('platform-backups', 'platform-backups', false)");
    const authGrant = sql.slice(sql.indexOf("grant execute on function private.admin_backups()"), sql.indexOf("to authenticated;", sql.indexOf("grant execute on function private.admin_backups()")));
    for (const helper of ["backup_tables", "backup_table_page", "backup_begin", "backup_finish", "backup_org_page"]) expect(authGrant, helper).not.toContain(helper);
    for (const fn of ["admin_backups", "admin_backup_authorize", "admin_backup_download", "admin_org_export", "admin_system_health", "admin_error_handled"]) {
      const body = sql.slice(sql.indexOf(`create function private.${fn}(`), sql.indexOf("end $$;", sql.indexOf(`create function private.${fn}(`)));
      expect(body, fn).toContain("perform private.require_platform_admin(array[]::text[]);");
    }
    const view = sql.slice(sql.indexOf("create function private.admin_org_view("), sql.indexOf("end $$;", sql.indexOf("create function private.admin_org_view(")));
    expect(view).toContain("perform private.require_platform_admin(array['support']);");
    expect(view).toContain("'org_viewed'");
    expect(view).not.toMatch(/\b(insert into public|update public|delete from public)/);
  });
});

describe("health and the read-only view", () => {
  const now = Date.parse("2026-11-24T09:00:00Z");
  it("formats sizes, durations and waiting times in Arabic", () => {
    expect(formatBytes(512)).toBe("٥١٢ بايت");
    expect(formatBytes(1536)).toBe("١٫٥ ك.ب");
    expect(formatBytes(5 * 1024 * 1024)).toBe("٥ م.ب");
    expect(formatDuration(450)).toBe("٤٥٠ ملّي ث");
    expect(formatDuration(75_000)).toBe("١ د ١٥ ث");
    expect(waitText(null, now)).toBe("—");
    expect(waitText("2026-11-24T08:55:00Z", now)).toBe("٥ دقيقة");
    expect(waitText("2026-11-22T09:00:00Z", now)).toBe("٢ يوم");
  });
  it("a queue is late when its oldest item waits too long; a backup is fresh within 26 hours", () => {
    expect(queueState({ key: "telegram", waiting: 3, failed: 0, oldest: "2026-11-24T08:30:00Z" }, now)).toBe("bad");
    expect(queueState({ key: "email", waiting: 3, failed: 1, oldest: "2026-11-24T08:30:00Z" }, now)).toBe("warn");
    expect(queueState({ key: "email", waiting: 0, failed: 0, oldest: null }, now)).toBe("");
    expect(backupFresh("2026-11-23T08:00:00Z", now)).toBe(true);
    expect(backupFresh("2026-11-23T06:00:00Z", now)).toBe(false);
    expect(backupFresh(null, now)).toBe(false);
  });
  it("links to the Supabase project, sections of the view, labels, and owner-only pages in the sidebar", () => {
    expect(supabaseDashboard("https://vhcdzonkgalpcozbhmmj.supabase.co")).toBe("https://supabase.com/dashboard/project/vhcdzonkgalpcozbhmmj");
    expect(supabaseDashboard("https://supabase.example.test")).toBeNull();
    expect(isViewSection("finance")).toBe(true);
    expect(isViewSection("payroll")).toBe(false);
    for (const action of ["backup_started", "backup_downloaded", "org_exported", "error_handled", "org_viewed"]) expect(auditLabel(action)).not.toBe(action);
    const owner = adminNavFor("owner").find(group => group.title === "الحماية والتشغيل")!.items.map(item => item.href);
    expect(owner).toEqual(["/admin/health", "/admin/backups", "/admin/security", "/admin/audit"]);
    expect(adminNavFor("support").flatMap(group => group.items.map(item => item.href))).not.toContain("/admin/backups");
  });
  it("no «قريبًا» is left in the admin console", () => {
    const files = ["components/admin-overview.tsx", "components/admin-shell.tsx", "lib/admin-nav.ts", "components/admin-org-profile.tsx", "components/admin-stage3-views.tsx", "components/admin-stage4-views.tsx"];
    for (const file of files) expect(readFileSync(file, "utf8").replace(/تنتهي قريبًا/g, ""), file).not.toContain("قريبًا");
  });
});
