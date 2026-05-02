#!/usr/bin/env node
// sync.js — orchestration: fetch, screen, render, write, commit
// Zero npm dependencies. Uses native node:fs, node:crypto, node:child_process.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fetchPilot, fetchStringResources, fetchEntityConfig, ErrorKind } from './fetcher.js';
import { screenConfig, screenStrings, scrubBearer } from './screen.js';
import { renderPilot } from './renderer.js';
import { writeJson } from './json-normalize.js';

// ── Config from environment ──────────────────────────────────────────

const TOKEN = process.env.BIDGELY_API_TOKEN;
const ENV_NAME = process.env.BIDGELY_ENV || 'unknown';
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();

// PILOT_CONFIGS is a JSON object mapping pilot ID → API base URL.
// e.g. {"20018":"https://api-server-nashville-uat.bidgely.com","20019":"https://api-server-other.bidgely.com"}
let PILOT_CONFIGS;
try {
  PILOT_CONFIGS = JSON.parse(process.env.PILOT_CONFIGS || '');
} catch {
  console.error('Missing or invalid PILOT_CONFIGS. Expected JSON object: {"pilotId":"baseUrl",...}');
  process.exit(1);
}

const PILOT_IDS = Object.keys(PILOT_CONFIGS);

// LEVELS_OF_INTEREST is a JSON array of entity-id suffixes (relative to pilot id),
// e.g. ["MONTHLY_SUMMARY.ELECTRIC", "USER_WELCOME.GAS", "WEB_DASHBOARD"].
// For each pilot, we fetch /entities/pilot/{pilotId}.{level}/configs.
// 404 means the level doesn't exist for this pilot — expected, skipped silently.
// Optional. Default empty array = current behavior (root only).
let LEVELS_OF_INTEREST;
try {
  LEVELS_OF_INTEREST = JSON.parse(process.env.LEVELS_OF_INTEREST || '[]');
  if (!Array.isArray(LEVELS_OF_INTEREST)) throw new Error('not an array');
  if (!LEVELS_OF_INTEREST.every(l => typeof l === 'string' && l.length > 0)) {
    throw new Error('all entries must be non-empty strings');
  }
} catch (err) {
  console.error(`Invalid LEVELS_OF_INTEREST: ${err.message}. Expected JSON array of strings, e.g. ["MONTHLY_SUMMARY.ELECTRIC"].`);
  process.exit(1);
}

if (!TOKEN) { console.error('Missing BIDGELY_API_TOKEN'); process.exit(1); }
if (PILOT_IDS.length === 0) { console.error('PILOT_CONFIGS has no entries'); process.exit(1); }

// ── Paths ────────────────────────────────────────────────────────────

const pilotsDir = join(REPO_ROOT, 'pilots');
const metaDir = join(REPO_ROOT, '_meta');

mkdirSync(pilotsDir, { recursive: true });
mkdirSync(metaDir, { recursive: true });

// ── Per-(pilot, env) processor ───────────────────────────────────────

/**
 * Fetch + screen + write one pilot's data for one environment.
 *
 * Returns:
 *   { ok: true,  hadHits: boolean, fieldCount: number }
 *   { ok: false, kind: ErrorKind,  message: string }
 */
async function processPilotEnv(pilotId, env, baseUrl, token, now) {
  const fetchResult = await fetchPilot(pilotId, { baseUrl, token });

  if (!fetchResult.ok) {
    const { kind, message } = fetchResult.error;
    const safeMessage = scrubBearer(message);
    console.error(`[sync] Pilot ${pilotId} FAILED: ${kind} — ${safeMessage}`);

    // Preserve prior state — do NOT overwrite existing files
    // But update the staleness header in the markdown if it exists
    updateStalenessHeader(pilotId, now, `${kind}: ${safeMessage}`);

    return { ok: false, kind, message: safeMessage };
  }

  const config = fetchResult.data;
  let hadHits = false;

  // ── New-field detection (informational, no fail) ──
  const jsonPath = join(pilotsDir, `${pilotId}.json`);
  const prevConfig = readJsonSafe(jsonPath, {});
  const prevKeys = new Set(Object.keys(prevConfig));
  const newKeys = Object.keys(config).filter(k => !prevKeys.has(k));
  if (newKeys.length > 0 && Object.keys(prevConfig).length > 0) {
    console.log(`::notice::Pilot ${pilotId}: ${newKeys.length} new field(s): ${newKeys.join(', ')}`);
  }

  // ── Sensitive-pattern screen ──
  const screenHits = screenConfig(config);

  if (screenHits.length > 0) {
    console.warn(`[sync] Pilot ${pilotId}: ${screenHits.length} sensitive-pattern hits`);
    for (const hit of screenHits) {
      console.warn(`[sync]   ${hit.fieldName} → ${hit.patternName}`);
    }
    hadHits = true;

    // Write field names only, never values
    const hitsPath = join(metaDir, 'screen_hits.json');
    const existing = readJsonSafe(hitsPath, {});
    existing[pilotId] = screenHits.map(h => ({ field: h.fieldName, pattern: h.patternName }));
    writeJson(hitsPath, existing);
  }

  // ── Write JSON ──
  writeJson(jsonPath, config);

  // ── Fetch entity-level overrides (LEVELS_OF_INTEREST) ──
  // Each level is fetched as /entities/pilot/{pilotId}.{level}/configs.
  // 404 → skip silently (level doesn't exist for this pilot, expected).
  // Other failures → log warning, continue with other levels.
  // Successes → write to pilots/{pilotId}.levels/{level}.json + screen + accumulate.
  const levels = {};
  if (LEVELS_OF_INTEREST.length > 0) {
    const levelsDir = join(pilotsDir, `${pilotId}.levels`);
    mkdirSync(levelsDir, { recursive: true });

    for (const level of LEVELS_OF_INTEREST) {
      const entityId = `${pilotId}.${level}`;
      const levelResult = await fetchEntityConfig(entityId, { baseUrl, token });

      if (!levelResult.ok) {
        if (levelResult.error.kind === ErrorKind.NOT_FOUND) {
          // Expected: this level isn't configured for this pilot. Skip silently.
          continue;
        }
        const safe = scrubBearer(levelResult.error.message);
        console.warn(`[sync]   level ${level} FAILED: ${levelResult.error.kind} — ${safe}`);
        continue;
      }

      const levelConfig = levelResult.data;

      // Screen level config for sensitive patterns
      const levelHits = screenConfig(levelConfig);
      if (levelHits.length > 0) {
        console.warn(`[sync] Pilot ${pilotId} level ${level}: ${levelHits.length} sensitive-pattern hits`);
        for (const hit of levelHits) {
          console.warn(`[sync]   ${hit.fieldName} → ${hit.patternName}`);
        }
        hadHits = true;

        const hitsPath = join(metaDir, 'screen_hits.json');
        const existing = readJsonSafe(hitsPath, {});
        existing[`${pilotId}.${level}`] = levelHits.map(h => ({ field: h.fieldName, pattern: h.patternName }));
        writeJson(hitsPath, existing);
      }

      writeJson(join(levelsDir, `${level}.json`), levelConfig);
      levels[level] = levelConfig;
    }
    console.log(`[sync] Pilot ${pilotId} levels: ${Object.keys(levels).length}/${LEVELS_OF_INTEREST.length} present`);
  }

  // ── Write Markdown ──
  const meta = {
    env,
    lastSuccessfulSync: now,
    lastAttempted: now,
  };
  const md = renderPilot(pilotId, config, meta, levels);
  const mdPath = join(pilotsDir, `${pilotId}.md`);
  writeFileSync(mdPath, md + '\n');

  // ── Fetch string resources (pilot-level, default locale) ──
  const locale = deriveLocale(config);
  const stringsResult = await fetchStringResources(pilotId, { baseUrl, token, locale });

  if (stringsResult.ok) {
    const stringsHits = screenStrings(stringsResult.data);
    if (stringsHits.length > 0) {
      console.warn(`[sync] Pilot ${pilotId} strings (${locale}): ${stringsHits.length} sensitive-pattern hits`);
      for (const hit of stringsHits) {
        console.warn(`[sync]   ${hit.fieldName} → ${hit.patternName}`);
      }
      hadHits = true;
      const hitsPath = join(metaDir, 'screen_hits.json');
      const existing = readJsonSafe(hitsPath, {});
      existing[`${pilotId}.strings`] = stringsHits.map(h => ({ field: h.fieldName, pattern: h.patternName }));
      writeJson(hitsPath, existing);
    }

    const stringsPath = join(pilotsDir, `${pilotId}.strings.json`);
    writeJson(stringsPath, stringsResult.data);
    console.log(`[sync] Pilot ${pilotId} strings OK (${locale}, ${Object.keys(stringsResult.data).length} keys)`);
  } else {
    const { kind, message } = stringsResult.error;
    console.warn(`[sync] Pilot ${pilotId} strings (${locale}) FAILED: ${kind} — ${scrubBearer(message)}`);
  }

  return { ok: true, hadHits, fieldCount: Object.keys(config).length };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const now = new Date().toISOString();
  const results = { ok: [], failures: [] };
  let allAuthFailure = true;
  let hasScreenHits = false;

  console.log(`[sync] Starting sync for ${PILOT_IDS.length} pilots in ${ENV_NAME} at ${now}`);

  for (const pilotId of PILOT_IDS) {
    console.log(`[sync] Fetching pilot ${pilotId}...`);

    const baseUrl = PILOT_CONFIGS[pilotId];
    const result = await processPilotEnv(pilotId, ENV_NAME, baseUrl, TOKEN, now);

    if (!result.ok) {
      if (result.kind !== ErrorKind.AUTH) allAuthFailure = false;
      results.failures.push({ id: pilotId, kind: result.kind, message: result.message });
      continue;
    }

    allAuthFailure = false;
    if (result.hadHits) hasScreenHits = true;

    results.ok.push(pilotId);
    console.log(`[sync] Pilot ${pilotId} OK (${result.fieldCount} fields)`);
  }

  // ── All-auth short-circuit ──
  if (results.failures.length === PILOT_IDS.length && allAuthFailure) {
    console.error('[sync] ALL pilots failed with auth errors. Token likely rotated.');
    console.error('[sync] NOT writing _meta, NOT committing. Fix the token.');
    process.exit(2);
  }

  // ── Write _meta/last_run.json ──
  const schemaHash = createHash('sha256')
    .update(JSON.stringify(Object.keys(results.ok.length > 0 ? readJsonSafe(join(pilotsDir, `${results.ok[0]}.json`), {}) : {}).sort()))
    .digest('hex')
    .slice(0, 12);

  const lastRun = {
    timestamp: now,
    env: ENV_NAME,
    ok: results.ok,
    failures: results.failures,
    schemaHash,
  };
  writeJson(join(metaDir, 'last_run.json'), lastRun);

  // ── Git commit (diff-only) ──
  try {
    execSync('git add pilots/ _meta/', { cwd: REPO_ROOT, stdio: 'pipe' });
    execSync('git diff --cached --quiet', { cwd: REPO_ROOT, stdio: 'pipe' });
    console.log('[sync] No changes detected. Skipping commit.');
  } catch (diffErr) {
    // git diff --cached --quiet exits non-zero when there ARE changes
    if (diffErr.status === 1) {
      const commitMsg = `sync: ${results.ok.length}/${PILOT_IDS.length} pilots updated at ${now}`;
      execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
      console.log(`[sync] Committed: ${commitMsg}`);
    } else {
      console.error(`[sync] Git error: ${scrubBearer(diffErr.message)}`);
    }
  }

  // ── Exit code ──
  if (hasScreenHits) {
    console.error('[sync] EXITING NON-ZERO: sensitive-pattern hits. Review _meta/screen_hits.json');
    process.exit(4);
  }
  if (results.failures.length > 0) {
    console.error(`[sync] EXITING NON-ZERO: ${results.failures.length} pilot(s) failed.`);
    process.exit(1);
  }

  console.log(`[sync] Done. ${results.ok.length} pilots synced successfully.`);
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Pull default_locale from frontend_configs.kvs and normalize to en_US form.
 * Falls back to en_US when missing or unparseable.
 */
function deriveLocale(config) {
  const raw = config.frontend_configs;
  if (typeof raw !== 'string') return 'en_US';
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.kvs)) return 'en_US';
    const entry = parsed.kvs.find(kv => kv.key === 'default_locale');
    if (!entry || typeof entry.val !== 'string') return 'en_US';
    return entry.val.replace('-', '_');
  } catch {
    return 'en_US';
  }
}

function readJsonSafe(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

/**
 * Update only the staleness header of an existing pilot's markdown.
 * If the file doesn't exist yet, skip — nothing to update.
 */
function updateStalenessHeader(pilotId, attemptTime, errorMsg) {
  const mdPath = join(pilotsDir, `${pilotId}.md`);
  if (!existsSync(mdPath)) return;

  const content = readFileSync(mdPath, 'utf-8');
  const lines = content.split('\n');

  // Find and update the Last attempted line
  let updated = false;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].startsWith('**Last attempted:**')) {
      lines[i] = `**Last attempted:** ${attemptTime}`;
      updated = true;
    }
    if (lines[i].startsWith('**Last error:**')) {
      lines[i] = `**Last error:** ${errorMsg}`;
      updated = true;
    }
  }

  // Add error line if it wasn't there before
  if (updated) {
    if (!lines.some(l => l.startsWith('**Last error:**'))) {
      // Insert after Last attempted
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        if (lines[i].startsWith('**Last attempted:**')) {
          lines.splice(i + 1, 0, `**Last error:** ${errorMsg}`);
          break;
        }
      }
    }
    writeFileSync(mdPath, lines.join('\n'));
  }
}

main().catch(err => {
  console.error(`[sync] Fatal: ${scrubBearer(err.message)}`);
  process.exit(1);
});
