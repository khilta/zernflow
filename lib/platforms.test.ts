import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS, PLATFORM_LABELS, isSupportedPlatform, platformLabel } from "./platforms";

/**
 * Issue #16: the channel picker offered WhatsApp, the connect route rejected it
 * and the channels check constraint could not have stored it anyway. Each layer
 * carried its own copy of the list. These tests pin them to PLATFORMS.
 */
describe("platform allowlist", () => {
  it("labels every supported platform", () => {
    for (const platform of PLATFORMS) {
      expect(PLATFORM_LABELS[platform]).toBeTruthy();
    }
  });

  it("accepts supported platforms and rejects everything else", () => {
    expect(isSupportedPlatform("whatsapp")).toBe(true);
    expect(isSupportedPlatform("instagram")).toBe(true);
    // Zernio connects these, ZernFlow has no inbox for them.
    expect(isSupportedPlatform("tiktok")).toBe(false);
    expect(isSupportedPlatform("youtube")).toBe(false);
    expect(isSupportedPlatform(undefined)).toBe(false);
  });

  it("falls back to a capitalised name for unknown platforms", () => {
    expect(platformLabel("whatsapp")).toBe("WhatsApp");
    expect(platformLabel("tiktok")).toBe("Tiktok");
  });

  it("matches the channels platform check constraint", () => {
    expect(latestChannelsPlatformConstraint()).toEqual([...PLATFORMS].sort());
  });

  it("keeps ALL_MIGRATIONS.sql a faithful in-order copy of every migration", () => {
    const dir = migrationsDir();
    const bundle = readFileSync(join(dir, "ALL_MIGRATIONS.sql"), "utf8");
    let cursor = 0;
    for (const file of migrationFiles()) {
      const body = readFileSync(join(dir, file), "utf8").trim();
      const at = bundle.indexOf(body, cursor);
      expect(at, `${file} missing from ALL_MIGRATIONS.sql or out of order`).toBeGreaterThan(-1);
      cursor = at + body.length;
    }
  });
});

function migrationsDir(): string {
  return join(__dirname, "..", "supabase", "migrations");
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir())
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
}

/** The platform list from the newest migration that redefines the constraint. */
function latestChannelsPlatformConstraint(): string[] {
  const dir = migrationsDir();

  for (const file of [...migrationFiles()].reverse()) {
    const sql = readFileSync(join(dir, file), "utf8");
    const match = sql.match(
      /channels[\s\S]*?platform[\s\S]*?check\s*\(\s*platform\s+in\s*\(([^)]*)\)/i
    );
    if (match) {
      return match[1]
        .split(",")
        .map((v) => v.trim().replace(/^'|'$/g, ""))
        .sort();
    }
  }
  throw new Error("no migration defines the channels platform constraint");
}
