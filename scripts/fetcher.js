// fetcher.js — fetch pilot configs with retry + error classification
// Zero dependencies. Uses native fetch.

import { scrubBearer } from './screen.js';

/** Error kinds for classification */
export const ErrorKind = {
  AUTH: 'auth',
  RATE_LIMIT: 'rate_limit',
  SERVER: 'server',
  NETWORK: 'network',
  NOT_FOUND: 'not_found',
  CLIENT: 'client',
  PARSE: 'parse',
};

/**
 * Classify an error or HTTP status into an ErrorKind.
 *
 * 404 is its own kind (NOT_FOUND) rather than CLIENT so callers can decide:
 *   - fetchPilot: 404 = pilot doesn't exist → real failure
 *   - fetchEntityConfig: 404 = level doesn't exist for this pilot → skip silently
 */
export function classifyError(err, status) {
  if (status === 401 || status === 403) return ErrorKind.AUTH;
  if (status === 429) return ErrorKind.RATE_LIMIT;
  if (status >= 500) return ErrorKind.SERVER;
  if (status === 404) return ErrorKind.NOT_FOUND;
  if (status >= 400) return ErrorKind.CLIENT;
  if (err && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED')) {
    return ErrorKind.NETWORK;
  }
  if (err && err.name === 'AbortError') return ErrorKind.NETWORK;
  return ErrorKind.NETWORK; // default for fetch failures
}

/**
 * Whether an error kind is retryable.
 */
function isRetryable(kind) {
  return kind === ErrorKind.NETWORK || kind === ErrorKind.SERVER || kind === ErrorKind.RATE_LIMIT;
}

/**
 * Fetch a single pilot's config with retry.
 * Retries 2x with 2s backoff for network/5xx/429 only.
 * Never retries auth failures or 4xx (except 429).
 * Cap per-pilot total time at 30s.
 *
 * @param {string|number} pilotId
 * @param {object} opts — { baseUrl, token }
 * @returns {Promise<{ ok: boolean, data?: object, error?: { kind: string, message: string } }>}
 */
export async function fetchPilot(pilotId, { baseUrl, token }) {
  const url = `${baseUrl}/entities/pilot/${pilotId}/configs`;
  return fetchWithRetry(url, token);
}

/**
 * Fetch a pilot's string resources for a given locale.
 * Same retry/timeout behavior as fetchPilot.
 *
 * @param {string|number} pilotId
 * @param {object} opts — { baseUrl, token, locale }
 * @returns {Promise<{ ok: boolean, data?: object, error?: { kind: string, message: string } }>}
 */
export async function fetchStringResources(pilotId, { baseUrl, token, locale }) {
  const url = `${baseUrl}/2.1/stringResources/pilot/${pilotId}?locale=${encodeURIComponent(locale)}`;
  return fetchWithRetry(url, token);
}

/**
 * Fetch one entity-level config (e.g. "20018.MONTHLY_SUMMARY.ELECTRIC").
 * Same retry/timeout behavior as fetchPilot.
 *
 * Caller-side note: 404 is the EXPECTED return when this level isn't
 * configured for the pilot — kind === ErrorKind.NOT_FOUND, treat as "skip
 * silently," NOT as an error.
 *
 * @param {string} entityId — the full entity id, e.g. "20018.MONTHLY_SUMMARY.ELECTRIC"
 * @param {object} opts — { baseUrl, token }
 * @returns {Promise<{ ok: boolean, data?: object, error?: { kind: string, message: string } }>}
 */
export async function fetchEntityConfig(entityId, { baseUrl, token }) {
  const url = `${baseUrl}/entities/pilot/${entityId}/configs`;
  return fetchWithRetry(url, token);
}

async function fetchWithRetry(url, token) {
  const maxRetries = 2;
  const backoffMs = 2000;
  const timeoutMs = 30000;

  const deadline = Date.now() + timeoutMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (Date.now() >= deadline) {
      return { ok: false, error: { kind: ErrorKind.NETWORK, message: `Timeout: exceeded ${timeoutMs}ms` } };
    }

    try {
      const controller = new AbortController();
      const remaining = deadline - Date.now();
      const timer = setTimeout(() => controller.abort(), remaining);

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        try {
          const data = await res.json();
          return { ok: true, data };
        } catch (parseErr) {
          return { ok: false, error: { kind: ErrorKind.PARSE, message: scrubBearer(parseErr.message) } };
        }
      }

      const kind = classifyError(null, res.status);
      const message = `HTTP ${res.status} ${res.statusText}`;

      if (!isRetryable(kind)) {
        return { ok: false, error: { kind, message } };
      }

      if (attempt < maxRetries) {
        await sleep(backoffMs * (attempt + 1));
        continue;
      }

      return { ok: false, error: { kind, message: `${message} (after ${maxRetries} retries)` } };

    } catch (err) {
      const kind = classifyError(err, null);
      const message = scrubBearer(err.message || 'Unknown fetch error');

      if (!isRetryable(kind) || attempt >= maxRetries) {
        return { ok: false, error: { kind, message } };
      }

      await sleep(backoffMs * (attempt + 1));
    }
  }

  return { ok: false, error: { kind: ErrorKind.NETWORK, message: 'Exhausted retries' } };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
