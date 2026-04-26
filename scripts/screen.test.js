// screen.test.js — tests for sensitive-pattern screen
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { screenValue, screenConfig, screenStrings, scrubBearer } from './screen.js';

describe('screenValue', () => {
  it('returns null for clean config values', () => {
    assert.strictEqual(screenValue('bill_projection.model', 'FIFTEEN_SEVEN_MODEL'), null);
    assert.strictEqual(screenValue('some_key', 'false'), null);
    assert.strictEqual(screenValue('color', '#0079c1'), null);
    assert.strictEqual(screenValue('threshold', '300'), null);
  });

  it('catches bearer prefix', () => {
    const hit = screenValue('auth', 'Bearer abc123xyz');
    assert.ok(hit);
    assert.strictEqual(hit.patternName, 'bearer_prefix');
  });

  it('catches long base64 strings', () => {
    const hit = screenValue('blob', 'A'.repeat(64));
    assert.ok(hit);
    assert.strictEqual(hit.patternName, 'base64_long');
  });

  it('catches slack tokens', () => {
    const hit = screenValue('hook', 'xoxb-123456789-abcdef');
    assert.ok(hit);
    assert.strictEqual(hit.patternName, 'slack_token');
  });

  it('catches AWS access keys', () => {
    const hit = screenValue('aws', 'AKIAIOSFODNN7EXAMPLE');
    assert.ok(hit);
    assert.strictEqual(hit.patternName, 'aws_key');
  });

  it('returns null for non-string values', () => {
    assert.strictEqual(screenValue('num', 42), null);
    assert.strictEqual(screenValue('obj', null), null);
  });
});

describe('screenConfig', () => {
  it('scans kvs values inside JSON strings', () => {
    const config = {
      bill_projection: JSON.stringify({
        kvs: [
          { key: 'model', val: 'FIFTEEN_SEVEN_MODEL' },
          { key: 'auth_header', val: 'Bearer abc123xyz' },
        ]
      })
    };
    const hits = screenConfig(config);
    const kvsHit = hits.find(h => h.fieldName === 'bill_projection.auth_header');
    assert.ok(kvsHit);
    assert.strictEqual(kvsHit.patternName, 'bearer_prefix');
  });

  it('returns empty array for clean config', () => {
    const config = {
      disagg_preference: JSON.stringify({
        kvs: [
          { key: 'timeband', val: 'true' },
          { key: 'disagg_module', val: 'MATLAB' },
        ]
      })
    };
    const hits = screenConfig(config);
    assert.deepStrictEqual(hits, []);
  });

  it('handles unparseable values gracefully', () => {
    const config = { broken: 'not json at all {{{' };
    const hits = screenConfig(config);
    assert.deepStrictEqual(hits, []);
  });
});

describe('screenStrings', () => {
  it('scans flat string resource objects', () => {
    const strings = {
      'com.bidgely.email.welcome': 'Welcome to our service',
      'com.bidgely.email.auth': 'Bearer abc123xyz',
    };
    const hits = screenStrings(strings);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].fieldName, 'com.bidgely.email.auth');
    assert.strictEqual(hits[0].patternName, 'bearer_prefix');
  });

  it('returns empty array for clean strings', () => {
    const strings = { 'a': 'hello', 'b': 'world' };
    assert.deepStrictEqual(screenStrings(strings), []);
  });

  it('handles empty object', () => {
    assert.deepStrictEqual(screenStrings({}), []);
  });
});

describe('scrubBearer', () => {
  it('redacts bearer tokens', () => {
    assert.strictEqual(
      scrubBearer('Authorization: Bearer abc123xyz'),
      'Authorization: bearer [REDACTED]'
    );
  });

  it('is case-insensitive', () => {
    assert.strictEqual(
      scrubBearer('BEARER mytoken123'),
      'bearer [REDACTED]'
    );
  });

  it('passes through clean strings', () => {
    assert.strictEqual(scrubBearer('just a normal error'), 'just a normal error');
  });

  it('handles non-strings', () => {
    assert.strictEqual(scrubBearer(42), 42);
    assert.strictEqual(scrubBearer(null), null);
  });
});
