// json-normalize.test.js — verify deterministic output.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sortKeys, stringifyStable, writeJson } from './json-normalize.js';

describe('sortKeys', () => {
  it('sorts top-level object keys', () => {
    const input = { b: 1, a: 2, c: 3 };
    const output = sortKeys(input);
    assert.deepStrictEqual(Object.keys(output), ['a', 'b', 'c']);
  });

  it('sorts nested object keys recursively', () => {
    const input = { outer: { z: 1, a: 2, m: 3 } };
    const output = sortKeys(input);
    assert.deepStrictEqual(Object.keys(output.outer), ['a', 'm', 'z']);
  });

  it('preserves array order', () => {
    const input = { list: [3, 1, 2] };
    assert.deepStrictEqual(sortKeys(input).list, [3, 1, 2]);
  });

  it('sorts keys inside objects nested in arrays', () => {
    const input = { kvs: [{ key: 'foo', val: 1 }, { val: 2, key: 'bar' }] };
    const output = sortKeys(input);
    assert.deepStrictEqual(Object.keys(output.kvs[0]), ['key', 'val']);
    assert.deepStrictEqual(Object.keys(output.kvs[1]), ['key', 'val']);
    // Array order itself preserved
    assert.strictEqual(output.kvs[0].key, 'foo');
    assert.strictEqual(output.kvs[1].key, 'bar');
  });

  it('passes through primitives untouched', () => {
    assert.strictEqual(sortKeys('hello'), 'hello');
    assert.strictEqual(sortKeys(42), 42);
    assert.strictEqual(sortKeys(null), null);
    assert.strictEqual(sortKeys(true), true);
  });
});

describe('stringifyStable', () => {
  it('produces identical output for two objects with different key insertion order', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    assert.strictEqual(stringifyStable(a), stringifyStable(b));
  });

  it('uses 2-space indent and trailing newline', () => {
    const out = stringifyStable({ a: 1 });
    assert.strictEqual(out, '{\n  "a": 1\n}\n');
  });
});

describe('writeJson', () => {
  it('writes deterministic bytes to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'json-normalize-test-'));
    try {
      const path = join(dir, 'out.json');
      writeJson(path, { z: 1, a: 2 });
      const written = readFileSync(path, 'utf-8');
      assert.strictEqual(written, '{\n  "a": 2,\n  "z": 1\n}\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('overwrites existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'json-normalize-test-'));
    try {
      const path = join(dir, 'out.json');
      writeJson(path, { a: 1 });
      writeJson(path, { b: 2 });
      const written = readFileSync(path, 'utf-8');
      assert.strictEqual(written, '{\n  "b": 2\n}\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
