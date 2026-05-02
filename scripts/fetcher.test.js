// fetcher.test.js — tests for error classification (fetch itself needs network)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, ErrorKind, fetchEntityConfig, fetchPilot, fetchStringResources } from './fetcher.js';

describe('classifyError', () => {
  it('classifies 401 as auth', () => {
    assert.strictEqual(classifyError(null, 401), ErrorKind.AUTH);
  });

  it('classifies 403 as auth', () => {
    assert.strictEqual(classifyError(null, 403), ErrorKind.AUTH);
  });

  it('classifies 429 as rate_limit', () => {
    assert.strictEqual(classifyError(null, 429), ErrorKind.RATE_LIMIT);
  });

  it('classifies 500 as server', () => {
    assert.strictEqual(classifyError(null, 500), ErrorKind.SERVER);
  });

  it('classifies 503 as server', () => {
    assert.strictEqual(classifyError(null, 503), ErrorKind.SERVER);
  });

  it('classifies 404 as not_found (separate from client)', () => {
    // 404 is its own kind so callers can treat "level doesn't exist for this pilot"
    // as a skip rather than a failure. See fetchEntityConfig docstring.
    assert.strictEqual(classifyError(null, 404), ErrorKind.NOT_FOUND);
  });

  it('classifies 400 as client', () => {
    assert.strictEqual(classifyError(null, 400), ErrorKind.CLIENT);
  });

  it('classifies 422 as client (not 404)', () => {
    // Sanity check: only 404 maps to NOT_FOUND; other 4xx still CLIENT.
    assert.strictEqual(classifyError(null, 422), ErrorKind.CLIENT);
  });

  it('classifies ECONNREFUSED as network', () => {
    const err = new Error('connect failed');
    err.code = 'ECONNREFUSED';
    assert.strictEqual(classifyError(err, null), ErrorKind.NETWORK);
  });

  it('classifies AbortError as network', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    assert.strictEqual(classifyError(err, null), ErrorKind.NETWORK);
  });

  it('defaults to network for unknown errors', () => {
    assert.strictEqual(classifyError(new Error('something'), null), ErrorKind.NETWORK);
  });
});

describe('fetcher exports', () => {
  // Smoke checks: the public surface is what sync.js imports.
  // Real network behavior is exercised by the cron in production.
  it('exports fetchPilot, fetchStringResources, fetchEntityConfig', () => {
    assert.strictEqual(typeof fetchPilot, 'function');
    assert.strictEqual(typeof fetchStringResources, 'function');
    assert.strictEqual(typeof fetchEntityConfig, 'function');
  });

  it('exports NOT_FOUND error kind', () => {
    assert.strictEqual(ErrorKind.NOT_FOUND, 'not_found');
  });
});
