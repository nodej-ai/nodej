#!/usr/bin/env node
/**
 * Catalog integrity check for the NodeJ plugin marketplace.
 * Reads .claude-plugin/marketplace.json and foundry.json and enforces
 * cross-file consistency rules. Exits 1 with a clear message on any
 * violation.
 *
 * Also exports checkCatalog() for reuse in nodej-site/scripts/sync-foundry.mjs.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_TIERS = new Set(['free', 'paid', 'demo']);

/**
 * Checks cross-file consistency between marketplace.json and foundry.json.
 * Returns { ok: true } on success, or { ok: false, message: string } on
 * the first violation found.
 *
 * Rules:
 *   a) every plugin in marketplace.json must have an entry in foundry.json items
 *   b) every foundry item's tier must be one of: free, paid, demo
 *   c) every foundry item must have a "page" starting with "/" or "https://"
 *   d) a foundry item with tier "paid" must NOT appear in marketplace.json
 *   e) a foundry item with kind "plugin" MUST appear in marketplace.json
 *   f) marketplace.json must not contain duplicate plugin names
 */
export function checkCatalog(marketplace, foundry) {
  const plugins = marketplace.plugins ?? [];
  const items = foundry.items ?? {};

  // Rule f: duplicate names in marketplace.json
  const seen = new Set();
  for (const p of plugins) {
    if (seen.has(p.name)) {
      return { ok: false, message: `Duplicate plugin name "${p.name}" in marketplace.json` };
    }
    seen.add(p.name);
  }

  const marketplaceNames = new Set(plugins.map((p) => p.name));

  // Rule a: every marketplace plugin must have a foundry entry
  for (const p of plugins) {
    if (!items[p.name]) {
      return {
        ok: false,
        message: `Plugin "${p.name}" is in marketplace.json but has no entry in foundry.json items`,
      };
    }
  }

  for (const [name, item] of Object.entries(items)) {
    // Rule b: valid tier
    if (!VALID_TIERS.has(item.tier)) {
      return {
        ok: false,
        message: `foundry.json item "${name}" has invalid tier "${item.tier}" (must be free, paid, or demo)`,
      };
    }

    // Rule c: page present and starts with "/" or "https://"
    if (
      typeof item.page !== 'string' ||
      (!item.page.startsWith('/') && !item.page.startsWith('https://'))
    ) {
      return {
        ok: false,
        message: `foundry.json item "${name}" has no valid "page" field (must start with "/" or "https://")`,
      };
    }

    // Rule d: paid items must not be in marketplace.json
    if (item.tier === 'paid' && marketplaceNames.has(name)) {
      return {
        ok: false,
        message: `foundry.json item "${name}" has tier "paid" but is listed in marketplace.json (paid items must not be installable from the public catalog)`,
      };
    }

    // Rule e: plugin-kind items must be in marketplace.json
    if (item.kind === 'plugin' && !marketplaceNames.has(name)) {
      return {
        ok: false,
        message: `foundry.json item "${name}" has kind "plugin" but is not listed in marketplace.json`,
      };
    }
  }

  return { ok: true };
}

// Run when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = join(__dirname, '..');

  let marketplace, foundry;
  try {
    marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'));
    foundry = JSON.parse(readFileSync(join(root, 'foundry.json'), 'utf8'));
  } catch (err) {
    console.error(`check-catalog: failed to read files — ${err.message}`);
    process.exit(1);
  }

  const result = checkCatalog(marketplace, foundry);
  if (!result.ok) {
    console.error(`check-catalog: FAIL — ${result.message}`);
    process.exit(1);
  }
  console.log('check-catalog: OK');
}
