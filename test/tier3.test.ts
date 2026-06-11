import { describe, it, expect } from 'vitest';
import { tier3Typo } from '../src/tiers/tier3-typo.js';
import { buildEntry } from '../src/entry.js';
import { normalizeQuery } from '../src/query.js';
import { search } from '../src/index.js';
import type { RomajiOption } from '../src/romaji/convert.js';

function run(query: string, data: string, romaji: RomajiOption = 'both') {
  return tier3Typo(normalizeQuery(query, romaji), buildEntry(data, 0, romaji));
}

describe('tier3Typo (spec 4.3)', () => {
  it('中間の置換: カミネリ → カミナリ（かな空間隔離、d=1）', () => {
    const m = run('カミネリ', 'カミナリ', false);
    expect(m).toMatchObject({ tier: 3, space: 'kana', positions: null });
    expect(m!.intraScore).toBeCloseTo(1 - 1 / 3, 10); // maxDist=2, d=1
  });

  it('中間の転置: カナミリ → カミナリ（かな空間隔離、d=1）', () => {
    const m = run('カナミリ', 'カミナリ', false);
    expect(m!.intraScore).toBeCloseTo(1 - 1 / 3, 10);
  });

  it('距離が maxDist 超過なら null', () => {
    expect(run('ソラ', 'カミナリ', false)).toBeNull();
  });

  it('romaji:false 時はかな空間のみで距離計測', () => {
    const m = run('カミネリ', 'カミナリ', false);
    expect(m!.space).toBe('kana');
  });
});

describe('tier3 公開 API（M7）', () => {
  it('中間誤字を tier3 で拾う（both: romaji 空間が d=1 で優位）', () => {
    const r = search('カミネリ', ['カミナリ', 'ソラ']);
    expect(r.map((x) => x.item)).toEqual(['カミナリ']);
    expect(r[0]!.tier).toBe(3);
    expect(r[0]!.score).toBeCloseTo((1 + 0.75) / 4, 10); // romaji d=1, maxDist=3 → intra 0.75
  });

  it('maxTier:2 は tier3 を実行しない', () => {
    expect(search('カミネリ', ['カミナリ'], { maxTier: 2 })).toEqual([]);
  });

  it('tier2 が tier3 より上位（レンジ分離）', () => {
    // カナリ=tier2(subsequence), カミネリ=tier3(typo) を同一クエリで比較するのは難しいので
    // 別クエリで score 帯を確認
    const t2 = search('カナリ', ['カミナリ'])[0]!;
    const t3 = search('カミネリ', ['カミナリ'])[0]!;
    expect(t2.tier).toBe(2);
    expect(t3.tier).toBe(3);
    expect(t2.score).toBeGreaterThan(t3.score);
  });
});
