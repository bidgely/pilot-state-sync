// fetcher.test.js — tests for error classification (fetch itself needs network)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, ErrorKind } from './fetcher.js';

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

  it('classifies 404 as client', () => {
    assert.strictEqual(classifyError(null, 404), ErrorKind.CLIENT);
  });

  it('classifies 400 as client', () => {
    assert.strictEqual(classifyError(null, 400), ErrorKind.CLIENT);
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
