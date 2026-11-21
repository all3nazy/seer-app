import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Logical backups of the platform (server only, service role): every table of the public and private
 * schemas as gzip JSON (one file per table), the auth users without password hashes, and a manifest
 * with row counts, sha256 per file and the schema version, under platform-backups/YYYY-MM-DD/.
 * Tables are read in pages, so a big table never has to fit in one database call.
 */
export const BACKUP_BUCKET = "platform-backups";
export const BACKUP_KEEP_DAYS = 30;
export const PAGE_SIZE = 1000;
/** The last migration in this repository (a unit test keeps it equal to the newest file). */
export const LATEST_MIGRATION = "20261124090000_admin_stage4";

export type BackupFile = { name: string; rows: number; bytes: number; sha256: string };
export type BackupManifest = { format: 1; folder: string; created_at: string; app_migration: string; db_version: string | null; tables: number; rows: number; bytes: number; files: BackupFile[] };
type TableInfo = { schema_name: string; table_name: string; row_count: number; pk: string[] };

export const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
/** A gzip JSON array, built page by page. */
export function gzipRows(pages: unknown[][]): { body: Buffer; rows: number } {
  const parts: string[] = ["["];
  let rows = 0;
  for (const page of pages) for (const row of page) { parts.push(`${rows ? "," : ""}\n${JSON.stringify(row)}`); rows += 1; }
  parts.push("\n]\n");
  return { body: gzipSync(Buffer.from(parts.join(""), "utf8")), rows };
}
/** Folders older than the retention (by their date name). */
export function expiredFolders(names: string[], today: string, keep = BACKUP_KEEP_DAYS): string[] {
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - keep * 86_400_000;
  return names.filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name) && new Date(`${name}T00:00:00Z`).getTime() < cutoff);
}

async function readTable(client: SupabaseClient, table: TableInfo): Promise<unknown[][]> {
  const pages: unknown[][] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.rpc("backup_table_page", { p_schema: table.schema_name, p_table: table.table_name, p_offset: offset, p_limit: PAGE_SIZE });
    if (error) throw new Error(`read ${table.schema_name}.${table.table_name}: ${error.message}`);
    const page = (data ?? []) as unknown[];
    pages.push(page);
    if (page.length < PAGE_SIZE) return pages;
  }
}

/** Auth users without secrets: id, email, phone, dates, metadata. */
async function readUsers(client: SupabaseClient): Promise<unknown[][]> {
  const pages: unknown[][] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`auth users: ${error.message}`);
    const users = data.users.map(user => ({ id: user.id, email: user.email ?? null, phone: user.phone ?? null, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null, user_metadata: user.user_metadata ?? {}, app_metadata: user.app_metadata ?? {} }));
    pages.push(users);
    if (users.length < PAGE_SIZE) return pages;
  }
}

async function put(client: SupabaseClient, path: string, body: Buffer, type: string) {
  const { error } = await client.storage.from(BACKUP_BUCKET).upload(path, body, { contentType: type, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

/** Runs one backup for a run started with backup_begin, then records the result with backup_finish. */
export async function runBackup(client: SupabaseClient, runId: number, folder: string): Promise<{ ok: boolean; manifest?: BackupManifest; error?: string }> {
  const files: BackupFile[] = [];
  try {
    const { data: tables, error } = await client.rpc("backup_tables");
    if (error) throw new Error(`list tables: ${error.message}`);
    for (const table of (tables ?? []) as TableInfo[]) {
      const { body, rows } = gzipRows(await readTable(client, table));
      const name = `${table.schema_name}.${table.table_name}.json.gz`;
      await put(client, `${folder}/${name}`, body, "application/gzip");
      files.push({ name, rows, bytes: body.length, sha256: sha256(body) });
    }
    const users = gzipRows(await readUsers(client));
    await put(client, `${folder}/auth.users.json.gz`, users.body, "application/gzip");
    files.push({ name: "auth.users.json.gz", rows: users.rows, bytes: users.body.length, sha256: sha256(users.body) });
    const version = await client.rpc("backup_db_version");
    const manifest: BackupManifest = { format: 1, folder, created_at: new Date().toISOString(), app_migration: LATEST_MIGRATION, db_version: (version.data as string | null) ?? null,
      tables: files.length, rows: files.reduce((sum, file) => sum + file.rows, 0), bytes: files.reduce((sum, file) => sum + file.bytes, 0), files };
    await put(client, `${folder}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
    await client.rpc("backup_finish", { p_run: runId, p_ok: true, p_bytes: manifest.bytes, p_tables: manifest.tables, p_rows: manifest.rows, p_manifest: manifest, p_error: null });
    await purgeOld(client, folder).catch(() => undefined);
    return { ok: true, manifest };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown error";
    await client.rpc("backup_finish", { p_run: runId, p_ok: false, p_bytes: files.reduce((sum, file) => sum + file.bytes, 0), p_tables: files.length, p_rows: files.reduce((sum, file) => sum + file.rows, 0), p_manifest: { files }, p_error: message.slice(0, 500) });
    return { ok: false, error: message };
  }
}

/** Deletes folders older than 30 days. */
export async function purgeOld(client: SupabaseClient, today: string) {
  const bucket = client.storage.from(BACKUP_BUCKET);
  const { data } = await bucket.list("", { limit: 1000 });
  for (const folder of expiredFolders((data ?? []).map(item => item.name), today)) {
    const { data: inside } = await bucket.list(folder, { limit: 1000 });
    const paths = (inside ?? []).map(item => `${folder}/${item.name}`);
    if (paths.length) await bucket.remove(paths);
    await client.rpc("backup_mark_purged", { p_folder: folder });
  }
}

/** One organization's data (every public table with organization_id), for a subscriber who leaves. */
export async function exportOrganization(client: SupabaseClient, org: string): Promise<Record<string, unknown[]>> {
  const { data: tables, error } = await client.rpc("backup_org_tables");
  if (error) throw new Error(error.message);
  const out: Record<string, unknown[]> = {};
  for (const { table_name } of (tables ?? []) as { table_name: string }[]) {
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await client.rpc("backup_org_page", { p_table: table_name, p_org: org, p_offset: offset, p_limit: PAGE_SIZE });
      if (page.error) throw new Error(page.error.message);
      const items = (page.data ?? []) as unknown[];
      rows.push(...items);
      if (items.length < PAGE_SIZE) break;
    }
    if (rows.length) out[table_name] = rows;
  }
  return out;
}
