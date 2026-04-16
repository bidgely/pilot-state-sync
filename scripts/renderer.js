// renderer.js — pure function: config object -> markdown string
// Zero dependencies. No fs, no network, no env.
// This is the durable asset. The cron plumbing around it is disposable.

/**
 * Render a pilot config into a Glean-friendly markdown document.
 *
 * @param {string|number} pilotId
 * @param {object} config — the allowlisted config object (top-level keys -> JSON strings with kvs)
 * @param {object} meta — { lastSuccessfulSync, lastAttempted, lastError?, env }
 * @returns {string} — markdown string
 */
export function renderPilot(pilotId, config, meta) {
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
    return lines.join('\n');
  }

  for (const key of keys) {
    lines.push(`## ${key}`);
    lines.push('');

    const rawValue = config[key];
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
      lines.push(truncate(rawValue, 500));
      lines.push('```');
    }

    lines.push('');
  }

  return lines.join('\n');
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
