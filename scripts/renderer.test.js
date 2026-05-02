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

  it('omits entity-level overrides when levels arg is missing', () => {
    const md = renderPilot(20018, {}, baseMeta);
    assert.ok(!md.includes('Entity-Level Overrides'));
  });

  it('omits entity-level overrides when levels is empty object', () => {
    const md = renderPilot(20018, {}, baseMeta, {});
    assert.ok(!md.includes('Entity-Level Overrides'));
  });

  it('renders one section per level, sorted alphabetically', () => {
    const config = {
      root_key: JSON.stringify({ kvs: [{ key: 'a', val: '1' }] })
    };
    const levels = {
      'USER_WELCOME.GAS': {
        delivery: JSON.stringify({ kvs: [{ key: 'mode', val: 'sms', configSource: 'PILOT.USER_WELCOME.GAS' }] })
      },
      'MONTHLY_SUMMARY.ELECTRIC': {
        billing: JSON.stringify({ kvs: [{ key: 'enabled', val: 'true', configSource: 'PILOT.MONTHLY_SUMMARY.ELECTRIC' }] })
      },
    };
    const md = renderPilot(20018, config, baseMeta, levels);
    // Both sections present
    assert.ok(md.includes('## Entity-Level Overrides — MONTHLY_SUMMARY.ELECTRIC'));
    assert.ok(md.includes('## Entity-Level Overrides — USER_WELCOME.GAS'));
    // Sorted alphabetically: MONTHLY before USER
    const monthlyPos = md.indexOf('Entity-Level Overrides — MONTHLY_SUMMARY.ELECTRIC');
    const userPos = md.indexOf('Entity-Level Overrides — USER_WELCOME.GAS');
    assert.ok(monthlyPos < userPos, 'MONTHLY level should come before USER level');
    // Inner h3 keys per level
    assert.ok(md.includes('### billing'));
    assert.ok(md.includes('### delivery'));
    // Provenance from configSource visible
    assert.ok(md.includes('PILOT.MONTHLY_SUMMARY.ELECTRIC'));
  });

  it('renders root config before entity-level overrides', () => {
    const config = {
      root_key: JSON.stringify({ kvs: [{ key: 'a', val: '1' }] })
    };
    const levels = {
      'MONTHLY_SUMMARY': { sub: JSON.stringify({ kvs: [{ key: 'b', val: '2' }] }) }
    };
    const md = renderPilot(20018, config, baseMeta, levels);
    const rootPos = md.indexOf('## root_key');
    const overridesPos = md.indexOf('## Entity-Level Overrides');
    assert.ok(rootPos > -1 && overridesPos > -1);
    assert.ok(rootPos < overridesPos, 'root config should render before overrides');
  });

  it('renders empty-overrides placeholder when a level has no keys', () => {
    const levels = { 'EMPTY_LEVEL': {} };
    const md = renderPilot(20018, {}, baseMeta, levels);
    assert.ok(md.includes('## Entity-Level Overrides — EMPTY_LEVEL'));
    assert.ok(md.includes('_No overrides at this level._'));
  });

  it('skips levels whose value is null or non-object', () => {
    const levels = {
      'GOOD': { k: JSON.stringify({ kvs: [{ key: 'a', val: '1' }] }) },
      'NULL_LEVEL': null,
      'STRING_LEVEL': 'oops',
    };
    const md = renderPilot(20018, {}, baseMeta, levels);
    assert.ok(md.includes('## Entity-Level Overrides — GOOD'));
    assert.ok(!md.includes('NULL_LEVEL'));
    assert.ok(!md.includes('STRING_LEVEL'));
  });
});
