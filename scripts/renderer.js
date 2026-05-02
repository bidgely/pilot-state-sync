// renderer.js — pure function: config object -> markdown string
// Zero dependencies. No fs, no network, no env.
// This is the durable asset. The cron plumbing around it is disposable.

/**
 * Render a pilot config into a Glean-friendly markdown document.
 *
 * @param {string|number} pilotId
 * @param {object} config — pilot config object (top-level keys -> JSON strings with kvs)
 * @param {object} meta — { lastSuccessfulSync, lastAttempted, lastError?, env }
 * @param {object} [levels] — optional entity-level overrides keyed by level name,
 *   e.g. { "MONTHLY_SUMMARY": configObj, "MONTHLY_SUMMARY.ELECTRIC": configObj }.
 *   Each level value has the same shape as `config` (top-level keys -> JSON-string kvs).
 *   When provided, each level renders as its own `## Entity-Level Overrides — {level}`
 *   section after the root config. When omitted or empty, no extra sections appear.
 * @returns {string} — markdown string
 */
export function renderPilot(pilotId, config, meta, levels) {
  const lines = [];

  // Staleness header — appears in Glean snippet preview
  lines.push(`# Pilot ${pilotId} — Live Config`);
  lines.push('');
  lines.push(`**Environment:** ${meta.env || 'unknown'}`);
  lines.push(`**Last successful sync:** ${meta.lastSuccessfulSync || 'never'}`);
  lines.push(`**Last attempted:** ${meta.lastAttempted || 'never'}`);
  if (meta.lastError) {
    lines.push(`**Last error:** ${meta.lastError}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  const keys = Object.keys(config).sort();

  if (keys.length === 0) {
    lines.push('_No config data available._');
  } else {
    for (const key of keys) {
      renderConfigSection(lines, `## ${key}`, config[key]);
    }
  }

  // Entity-level overrides — one section per level, sorted for stable output.
  if (levels && typeof levels === 'object') {
    const levelNames = Object.keys(levels).sort();
    for (const levelName of levelNames) {
      const levelConfig = levels[levelName];
      if (!levelConfig || typeof levelConfig !== 'object') continue;

      lines.push(`## Entity-Level Overrides — ${levelName}`);
      lines.push('');

      const levelKeys = Object.keys(levelConfig).sort();
      if (levelKeys.length === 0) {
        lines.push('_No overrides at this level._');
        lines.push('');
        continue;
      }

      for (const key of levelKeys) {
        renderConfigSection(lines, `### ${key}`, levelConfig[key]);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Render one config section (a top-level key and its kvs table or raw value).
 * Mutates `lines` in place. Heading is the caller's choice (## for root, ### for levels).
 */
function renderConfigSection(lines, heading, rawValue) {
  lines.push(heading);
  lines.push('');

  const kvs = parseKvs(rawValue);

  if (kvs) {
    lines.push('| Key | Value | Source | Version |');
    lines.push('|-----|-------|--------|---------|');
    for (const kv of kvs) {
      const val = truncate(String(kv.val ?? ''), 120);
      lines.push(`| ${esc(kv.key)} | ${esc(val)} | ${kv.configSource || ''} | ${kv.version ?? ''} |`);
    }
  } else {
    // Can't parse kvs — show raw value as code block
    lines.push('```json');
    lines.push(truncate(typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue), 500));
    lines.push('```');
  }

  lines.push('');
}

/**
 * Try to parse a config value's kvs array.
 * Returns the kvs array or null if not parseable.
 */
function parseKvs(rawValue) {
  if (typeof rawValue !== 'string') return null;
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && Array.isArray(parsed.kvs)) {
      return parsed.kvs;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/** Escape pipe characters for markdown tables */
function esc(str) {
  return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Truncate long strings with ellipsis */
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}
