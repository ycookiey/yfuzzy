import { describe, it, expect } from 'vitest';
import { tier1Exact } from '../src/tiers/tier1-exact.js';
import { buildEntry } from '../src/entry.js';
import { normalizeQuery } from '../src/query.js';
import type { RomajiOption } from '../src/romaji/convert.js';

function run(query: string, data: string, romaji: RomajiOption = 'both') {
  return tier1Exact(normalizeQuery(query, romaji), buildEntry(data, 0, romaji));
}

describe('tier1Exact (spec 4.1)', () => {
  it('かな完全一致 → intraScore 1.0', () => {
    expect(run('カミ', 'カミ')).toEqual({
      tier: 1,
      intraScore: 1,
      space: 'kana',
      positions: [0, 1],
    });
  });

  it('かな前方一致 → coverage × 1.0', () => {
    const m = run('カミ', 'カミナリ');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [0, 1] });
    expect(m!.intraScore).toBeCloseTo(0.5, 10); // 2/4 × 1.0
  });

  it('かな部分一致 → coverage × 0.9、位置は idx から', () => {
    const m = run('ミナ', 'カミナリ');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [1, 2] });
    expect(m!.intraScore).toBeCloseTo(0.45, 10); // 2/4 × 0.9
  });

  it('前方一致 > 部分一致（同 coverage で前方が高い）', () => {
    const prefix = run('カミ', 'カミナリ')!.intraScore; // 0.5
    const sub = run('ミナ', 'カミナリ')!.intraScore; // 0.45
    expect(prefix).toBeGreaterThan(sub);
  });

  it('かな不一致でも romaji 前方一致で拾う（長音ロバスト: keki → ケーキ）', () => {
    const m = run('keki', 'ケーキ');
    expect(m).toMatchObject({ tier: 1, space: 'kunrei', positions: [0, 1, 2, 3] });
    expect(m!.intraScore).toBeCloseTo(0.97, 10); // 4/4 × 0.97
  });

  it('非マッチは null', () => {
    expect(run('ソラ', 'カミナリ')).toBeNull();
  });

  it('romaji:false ではかな空間のみ（romaji 専用一致は拾わない）', () => {
    expect(run('keki', 'ケーキ', false)).toBeNull();
  });
});
