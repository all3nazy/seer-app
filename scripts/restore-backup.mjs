#!/usr/bin/env node
// Turns one backup folder (downloaded from «سِير أدمن» → النسخ الاحتياطي) into SQL files you can run
// in the Supabase SQL editor or with psql. It checks every file's sha256 against manifest.json first.
//   node scripts/restore-backup.mjs <folder> [out-dir]
// Each <schema>.<table>.sql inserts the rows with jsonb_populate_recordset, so the columns are matched by
// name and the table must already exist (run the migrations first). auth.users is written as JSON:
// see docs/restore.md (accounts are recreated through the Supabase admin API).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const [folder, out = `${folder}-sql`] = process.argv.slice(2);
if (!folder) { console.error("usage: node scripts/restore-backup.mjs <folder> [out-dir]"); process.exit(1); }
const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
mkdirSync(out, { recursive: true });
let bad = 0;
for (const file of manifest.files) {
  const gz = readFileSync(join(folder, file.name));
  const hash = createHash("sha256").update(gz).digest("hex");
  if (hash !== file.sha256) { console.error(`✗ ${file.name}: sha256 does not match`); bad += 1; continue; }
  const rows = JSON.parse(gunzipSync(gz).toString("utf8"));
  if (rows.length !== file.rows) { console.error(`✗ ${file.name}: ${rows.length} rows, manifest says ${file.rows}`); bad += 1; continue; }
  if (file.name.startsWith("auth.")) { writeFileSync(join(out, file.name.replace(/\.gz$/, "")), JSON.stringify(rows, null, 2)); continue; }
  const table = file.name.replace(/\.json\.gz$/, "");
  const [schema, name] = table.split(".");
  const tag = "$seer_rows$";
  const sql = rows.length
    ? `-- ${table}: ${rows.length} rows\ninsert into ${schema}."${name}" select * from jsonb_populate_recordset(null::${schema}."${name}", ${tag}${JSON.stringify(rows)}${tag}::jsonb) on conflict do nothing;\n`
    : `-- ${table}: empty\n`;
  writeFileSync(join(out, `${table}.sql`), sql);
}
console.log(bad ? `${bad} file(s) failed the check: do not restore from this folder.` : `OK: ${manifest.files.length} files checked, SQL in ${out}/`);
process.exit(bad ? 1 : 0);
