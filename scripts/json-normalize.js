// json-normalize.js — deterministic JSON output to keep diff-only commits clean.
// Zero dependencies. Pure functions.

import { writeFileSync } from 'node:fs';

/**
 * Recursively sort object keys so the same input always produces the same bytes.
 * Arrays preserve their order (semantically meaningful, e.g. kvs lists).
 */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * Stable serialization: deterministic key order, 2-space indent, trailing newline.
 * Returned string is what writeJson writes to disk.
 */
export function stringifyStable(obj) {
  return JSON.stringify(sortKeys(obj), null, 2) + '\n';
}

/**
 * Write an object to disk as deterministic JSON.
 * Without this, JSON.stringify can shuffle object-key order, producing
 * fake diffs sync-to-sync. Diff-only commits depend on this.
 */
export function writeJson(path, obj) {
  writeFileSync(path, stringifyStable(obj));
}
