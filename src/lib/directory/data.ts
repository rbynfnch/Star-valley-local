import { fixturesDirectory } from "./fixtures.ts";
import { supabaseDirectory } from "./supabase.ts";
import type { DirectoryData } from "./types.ts";

let cached: DirectoryData | undefined;

/** Production: Supabase. Development only: SVL_DATA_SOURCE=fixtures reads a local snapshot (see fixtures.ts). */
export function getDirectoryData(): DirectoryData {
  if (cached) return cached;
  if (process.env.SVL_DATA_SOURCE === "fixtures") {
    if (process.env.NODE_ENV === "production") throw new Error("SVL_DATA_SOURCE=fixtures is for development only");
    return (cached = fixturesDirectory());
  }
  return (cached = supabaseDirectory());
}
