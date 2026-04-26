// screen.js — sensitive-pattern regex screen
// Zero dependencies. Pure functions.

// Sensitive-pattern regexes — intentionally dumb, catches the 90% case.
const SENSITIVE_PATTERNS = [
  { name: 'bearer_prefix', pattern: /^Bearer\s+/i },
  { name: 'base64_long', pattern: /^[A-Za-z0-9+/=]{64,}$/ },
  { name: 'credit_card', pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/ },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'slack_token', pattern: /^xox[bpras]-/ },
  { name: 'openai_key', pattern: /^sk-[a-zA-Z0-9]{20,}/ },
  { name: 'aws_key', pattern: /^AKIA[0-9A-Z]{16}$/ },
  { name: 'uuid_user_id', pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i },
];

/**
 * Scan a value string for sensitive patterns.
 * Returns null if clean, or { fieldName, patternName } if a hit is found.
 */
export function screenValue(fieldName, value) {
  if (typeof value !== 'string') return null;

  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    if (pattern.test(value)) {
      return { fieldName, patternName: name };
    }
  }

  return null;
}

/**
 * Scan an entire config object's values for sensitive patterns.
 * Digs into the kvs structure: each top-level value is a JSON string
 * containing { kvs: [{ key, val, ... }] }.
 * Returns array of hits: [{ fieldName, patternName }].
 */
export function screenConfig(configObj) {
  const hits = [];

  for (const [topKey, rawValue] of Object.entries(configObj)) {
    // The raw value itself
    const topHit = screenValue(topKey, rawValue);
    if (topHit) hits.push(topHit);

    // Try to parse the kvs structure inside
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed && Array.isArray(parsed.kvs)) {
        for (const kv of parsed.kvs) {
          if (kv.val != null) {
            const hit = screenValue(`${topKey}.${kv.key}`, String(kv.val));
            if (hit) hits.push(hit);
          }
        }
      }
    } catch {
      // Not parseable JSON, that's fine — already screened the raw string
    }
  }

  return hits;
}

/**
 * Scan a flat string-resources object for sensitive patterns.
 * StringResources are shaped as { "resource.key": "text value", ... } —
 * no kvs wrapper, no nested JSON.
 * Returns array of hits: [{ fieldName, patternName }].
 */
export function screenStrings(stringsObj) {
  const hits = [];
  for (const [key, value] of Object.entries(stringsObj)) {
    const hit = screenValue(key, value);
    if (hit) hits.push(hit);
  }
  return hits;
}

/**
 * Strip bearer tokens from error messages before logging.
 */
export function scrubBearer(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/bearer\s+\S+/gi, 'bearer [REDACTED]');
}
