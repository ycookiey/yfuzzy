import { describe, it, expect } from 'vitest';
import { tier2Flexible } from '../src/tiers/tier2-flexible.js';
import { buildEntry } from '../src/entry.js';
import { normalizeQuery } from '../src/query.js';
import { search } from '../src/index.js';
import type { RomajiOption } from '../src/romaji/convert.js';

function run(query: string, data: string, romaji: RomajiOption = 'both') {
  return tier2Flexible(normalizeQuery(query, romaji), buildEntry(data, 0, romaji));
}

describe('tier2Flexible (spec 4.2)', () => {
  it('かな空間の subsequence（飛び石）: カナリ ⊆ カミナリ（romaji 無効で空間を隔離）', () => {
    const m = run('カナリ', 'カミナリ', false);
    expect(m).toMatchObject({ tier: 2, space: 'kana', positions: [0, 2, 3] });
    // boundary 1/3, continuity 2/3, start 1 → 0.55/3 + 0.30*2/3 + 0.15
    expect(m!.intraScore).toBeCloseTo(0.533333, 5);
  });

  it('both では romaji 空間も競合し高い方を採用（kanari ⊆ kaminari の連続 nari）', () => {
    const m = run('カナリ', 'カミナリ');
    expect(m).toMatchObject({ tier: 2, space: 'kunrei', positions: [0, 1, 4, 5, 6, 7] });
    expect(m!.intraScore).toBeCloseTo(0.625, 5); // boundary 3/6, continuity 4/6, start 1
  });

  it('子音のみ入力の頭文字救済: kmnr ⊆ kaminari（romaji 空間・全境界一致）', () => {
    const m = run('kmnr', 'カミナリ');
    expect(m).toMatchObject({ tier: 2, space: 'kunrei', positions: [0, 2, 4, 6] });
    // boundary 4/4, continuity 1/4, start 1 → 0.55 + 0.075 + 0.15
    expect(m!.intraScore).toBeCloseTo(0.775, 5);
  });

  it('subsequence でなければ null', () => {
    expect(run('リナ', 'カミナリ')).toBeNull(); // 順序が逆
  });

  it('romaji も1文字になるかな（ア→a）は tier2 非対象（null）', () => {
    // 'ア' は前方一致だが kana 1字・romaji 'a' も1字で両空間とも最小長未満
    expect(run('ア', 'アサガオ')).toBeNull();
  });

  it('romaji:false ではかな空間のみ評価', () => {
    expect(run('kmnr', 'カミナリ', false)).toBeNull(); // romaji 空間が無効
  });
});

describe('tier2 公開 API（M6）', () => {
  it('subsequence マッチを tier2 で返す', () => {
    const r = search('カナリ', ['カミナリ']);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ item: 'カミナリ', tier: 2 });
    expect(r[0]!.score).toBeCloseTo(0.65625, 5); // (2 + 0.625)/4、romaji 空間採用
  });

  it('tier1 が tier2 より上位（レンジ分離・first-match-wins）', () => {
    const r = search('カナリ', ['カミナリ', 'カナリア']);
    expect(r.map((x) => x.item)).toEqual(['カナリア', 'カミナリ']);
    expect(r.map((x) => x.tier)).toEqual([1, 2]);
  });

  it('maxTier:1 は tier2 を実行しない', () => {
    expect(search('カナリ', ['カミナリ'], { maxTier: 1 })).toEqual([]);
  });

  it('頭文字（子音列）検索が機能する', () => {
    const r = search('kmnr', ['カミナリ', 'ソラ']);
    expect(r.map((x) => x.item)).toEqual(['カミナリ']);
    expect(r[0]!.tier).toBe(2);
  });
});
