import { describe, it, expect } from 'vitest';
import { createIndex } from '../src/index.js';
import { GOLDEN, CASES } from './fixtures/golden.js';

describe('ゴールデン回帰（手書き中立データ）', () => {
  const index = createIndex(GOLDEN);

  for (const c of CASES) {
    it(`${c.query} → ${c.expectTop}（${c.note}）`, () => {
      const r = index.search(c.query);
      expect(r.length).toBeGreaterThan(0);
      expect(r[0]!.item).toBe(c.expectTop);
    });
  }

  it('データ全件がユニーク（重複なし）', () => {
    expect(new Set(GOLDEN).size).toBe(GOLDEN.length);
  });
});
