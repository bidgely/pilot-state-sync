import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.BIDGELY_API_TOKEN = process.env.BIDGELY_API_TOKEN || 'test-token';
process.env.PILOT_CONFIGS = process.env.PILOT_CONFIGS || '{"test":"https://example.com"}';
process.env.BIDGELY_ENV = process.env.BIDGELY_ENV || 'prod';

const { computeEnvSchemaHash, finalizeLastRun } = await import('./sync.js');

describe('finalizeLastRun', () => {
  it('returns the current run unchanged when merge mode is off', () => {
    const lastRun = finalizeLastRun(
      '2026-05-02T14:41:17.883Z',
      { ok: ['10128'], failures: [] },
      {
        existing: {
          env: 'prod',
          ok: ['20018'],
          failures: [],
          timestamp: '2026-05-02T14:41:07.311Z',
          schemaHash: 'oldhash',
        },
        schemaHash: 'newhash',
        envName: 'prod',
        mergeLastRun: false,
      }
    );

    assert.deepEqual(lastRun.ok, ['10128']);
    assert.deepEqual(lastRun.failures, []);
    assert.equal(lastRun.schemaHash, 'newhash');
  });

  it('merges prior env results when merge mode is enabled', () => {
    const lastRun = finalizeLastRun(
      '2026-05-02T14:41:17.883Z',
      { ok: ['10128', '10129'], failures: [] },
      {
        existing: {
          env: 'prod',
          ok: ['20018', '10136'],
          failures: [],
          timestamp: '2026-05-02T14:41:14.846Z',
          schemaHash: 'oldhash',
        },
        schemaHash: 'newhash',
        envName: 'prod',
        mergeLastRun: true,
      }
    );

    assert.deepEqual(lastRun.ok, ['10128', '10129', '10136', '20018']);
    assert.deepEqual(lastRun.failures, []);
    assert.equal(lastRun.schemaHash, 'newhash');
  });
});

describe('computeEnvSchemaHash', () => {
  it('hashes all pilot json files in an env directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-state-sync-'));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, '10128.json'), JSON.stringify({ b: 1, a: 2 }));
      writeFileSync(join(dir, '20018.json'), JSON.stringify({ c: 3 }));
      writeFileSync(join(dir, '10128.strings.json'), JSON.stringify({ ignored: true }));

      const hash = computeEnvSchemaHash({ pilotsDir: dir });
      assert.equal(typeof hash, 'string');
      assert.equal(hash.length, 12);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
