import { spawnSync } from "node:child_process";

/**
 * DEVELOPMENT ONLY (used by fixtures.ts). Runs one SELECT that returns a single jsonb value AS THE ANONYMOUS ROLE against
 * the local seeded database and returns it parsed. Values go in as psql variables (`:'name'` quotes them), never built into
 * the SQL string. `sql` must reference only :'name' variables from `vars`.
 */
export function psqlJson<T>(selectSql: string, vars: Record<string, string> = {}, db = process.env.SVL_FIXTURE_DB ?? "svl_seed"): T {
  const args = ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", db];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  args.push("-f", "-");
  const r = spawnSync("psql", args, { input: `begin; set local role anon; ${selectSql}; rollback;`, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`fixtures query failed: ${r.stderr}`);
  const line = r.stdout.split("\n").find((l) => l.trim().length > 0 && l !== "null") ?? "null";
  return JSON.parse(line) as T;
}
