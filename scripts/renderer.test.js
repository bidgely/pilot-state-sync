// renderer.test.js — tests for the pure markdown renderer
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPilot } from './renderer.js';

const baseMeta = {
  env: 'uat',
  lastSuccessfulSync: '2026-04-16T09:00:00Z',
  lastAttempted: '2026-04-16T09:00:00Z',
};

describe('renderPilot', () => {
  it('renders staleness header', () => {
    const md = renderPilot(20018, {}, baseMeta);
    assert.ok(md.includes('# Pilot 20018'));
    assert.ok(md.includes('**Environment:** uat'));
    assert.ok(md.includes('**Last successful sync:** 2026-04-16T09:00:00Z'));
    assert.ok(md.includes('**Last attempted:** 2026-04-16T09:00:00Z'));
    assert.ok(!md.includes('**Last error:**'));
  });

  it('renders error in staleness header when present', () => {
    const meta = { ...baseMeta, lastError: '401 Unauthorized (token likely rotated)' };
    const md = renderPilot(20018, {}, meta);
    assert.ok(md.includes('**Last error:** 401 Unauthorized (token likely rotated)'));
  });

  it('renders flat kvs config as markdown table', () => {
    const config = {
      disagg_preference: JSON.stringify({
        kvs: [
          { key: 'timeband', val: 'true', configSource: 'GLOBAL', version: 1 },
          { key: 'disagg_module', val: 'MATLAB', configSource: 'GLOBAL' },
        ]
      })
    };
    const md = renderPilot(20018, config, baseMeta);
    assert.ok(md.includes('## disagg_preference'));
    assert.ok(md.includes('| timeband | true | GLOBAL | 1 |'));
    assert.ok(md.includes('| disagg_module | MATLAB | GLOBAL |  |'));
  });

  it('renders nested JSON values truncated', () => {
    const longVal = '{"a":' + '"x'.repeat(100) + '"}';
    const config = {
      test_config: JSON.stringify({
        kvs: [{ key: 'nested', val: longVal, configSource: 'PILOT', version: 2 }]
      })
    };
    const md = renderPilot(20018, config, baseMeta);
    assert.ok(md.includes('## test_config'));
    assert.ok(md.includes('...'));
  });

  it('renders unparseable values as code blocks', () => {
    const config = { broken_config: 'not json at all' };
    const md = renderPilot(20018, config, baseMeta);
    assert.ok(md.includes('```json'));
    assert.ok(md.includes('not json at all'));
  });

  it('renders empty config with placeholder', () => {
    const md = renderPilot(20018, {}, baseMeta);
    assert.ok(md.includes('_No config data available._'));
  });

  it('sorts config sections alphabetically', () => {
    const config = {
      zebra_config: JSON.stringify({ kvs: [{ key: 'a', val: '1' }] }),
      alpha_config: JSON.stringify({ kvs: [{ key: 'b', val: '2' }] }),
    };
    const md = renderPilot(20018, config, baseMeta);
    const alphaPos = md.indexOf('## alpha_config');
    const zebraPos = md.indexOf('## zebra_config');
    assert.ok(alphaPos < zebraPos, 'alpha should come before zebra');
  });

  it('escapes pipe characters in values', () => {
    const config = {
      test: JSON.stringify({
        kvs: [{ key: 'with|pipe', val: 'val|ue', configSource: 'PILOT' }]
      })
    };
    const md = renderPilot(20018, config, baseMeta);
    assert.ok(md.includes('with\\|pipe'));
    assert.ok(md.includes('val\\|ue'));
  });
});
