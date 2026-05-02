#!/usr/bin/env node
// mint-token.js — exchange env-specific credentials for a short-lived access token.
// Zero dependencies. Uses native fetch + URL + URLSearchParams only.

import { scrubBearer } from './screen.js';

export function buildTokenRequest(env = process.env) {
  const mode = env.BIDGELY_TOKEN_MODE || 'refresh_token';
  const tokenUrl = requireEnv(env, 'BIDGELY_TOKEN_URL');
  const url = new URL(tokenUrl);
  const method = (env.BIDGELY_TOKEN_HTTP_METHOD || 'POST').toUpperCase();
  const headers = {
    'Accept': 'application/json',
  };

  let body = undefined;

  if (mode === 'client_credentials') {
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    if (env.BIDGELY_TOKEN_SCOPE) params.set('scope', env.BIDGELY_TOKEN_SCOPE);
    applyExtraParams(params, env.BIDGELY_TOKEN_EXTRA_BODY);

    headers.Authorization = `Basic ${requireEnv(env, 'BIDGELY_BASIC_AUTH')}`;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';

    if (method === 'GET') {
      for (const [key, value] of params) url.searchParams.set(key, value);
    } else {
      body = params;
    }
  } else if (mode === 'refresh_token') {
    const refreshField = env.BIDGELY_REFRESH_TOKEN_FIELD || 'refresh_token';
    const grantType = env.BIDGELY_REFRESH_GRANT_TYPE || 'refresh_token';
    const params = new URLSearchParams();
    params.set('grant_type', grantType);
    params.set(refreshField, requireEnv(env, 'BIDGELY_REFRESH_TOKEN'));

    if (env.BIDGELY_CLIENT_ID) params.set('client_id', env.BIDGELY_CLIENT_ID);
    if (env.BIDGELY_CLIENT_SECRET) params.set('client_secret', env.BIDGELY_CLIENT_SECRET);
    if (env.BIDGELY_TOKEN_SCOPE) params.set('scope', env.BIDGELY_TOKEN_SCOPE);
    if (env.BIDGELY_TOKEN_AUDIENCE) params.set('audience', env.BIDGELY_TOKEN_AUDIENCE);
    applyExtraParams(params, env.BIDGELY_TOKEN_EXTRA_BODY);

    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = params;
  } else {
    throw new Error(`Unsupported BIDGELY_TOKEN_MODE "${mode}"`);
  }

  return {
    url: url.toString(),
    method,
    headers,
    body,
  };
}

export function readAccessTokenFromPayload(payload, env = process.env) {
  const fieldPath = env.BIDGELY_ACCESS_TOKEN_FIELD || 'access_token';
  const token = getByPath(payload, fieldPath);
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(`Token response missing string field "${fieldPath}"`);
  }
  return token;
}

export async function mintToken(env = process.env, fetchImpl = fetch) {
  const request = buildTokenRequest(env);
  const res = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Token endpoint returned non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const message = typeof payload.error_description === 'string'
      ? payload.error_description
      : typeof payload.message === 'string'
        ? payload.message
        : `HTTP ${res.status} ${res.statusText}`;
    throw new Error(`Token mint failed: ${scrubBearer(message)}`);
  }

  return readAccessTokenFromPayload(payload, env);
}

function applyExtraParams(params, rawExtraBody) {
  if (!rawExtraBody) return;
  const extra = JSON.parse(rawExtraBody);
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
    throw new Error('BIDGELY_TOKEN_EXTRA_BODY must be a JSON object');
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value == null) continue;
    params.set(key, String(value));
  }
}

function getByPath(value, path) {
  const parts = path.split('.').filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function requireEnv(env, key) {
  const value = env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mintToken()
    .then(token => {
      process.stdout.write(token);
    })
    .catch(err => {
      console.error(`[mint-token] ${scrubBearer(err.message)}`);
      process.exit(1);
    });
}
