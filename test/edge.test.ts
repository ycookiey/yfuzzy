import { describe, it, expect } from 'vitest';
import { search, createIndex } from '../src/index.js';

// spec 7章 エッジケース表の網羅。

describe('エッジ: 空クエリ系 → []', () => {
  it('空文字', () => {
    expect(search('', ['カミ'])).toEqual([]);
  });
  it('半角空白のみ', () => {
    expect(search('   ', ['カミ'])).toEqual([]);
  });
  it('全角空白のみ（U+3000、trim 対象）', () => {
    expect(search('　', ['カミ'])).toEqual([]);
  });
});

describe('エッジ: 1文字クエリ', () => {
  it('1文字かなは tier1 で動作（前方/部分一致）', () => {
    // 'ミソ' は romaji 'miso' が 'ka' と編集距離≥2 のため tier3 にも掛からない
    const r = search('カ', ['カミ', 'ミソ']);
    expect(r.map((x) => x.item)).toEqual(['カミ']);
    expect(r[0]!.tier).toBe(1);
  });
  it('romaji も1文字（ア→a）で非一致なら []', () => {
    expect(search('ア', ['カミ'])).toEqual([]);
  });
  it('英字1文字: 前方一致が中間一致より常に上位、母音は中間一致も拾う', () => {
    const r = search('a', ['map', 'about']);
    expect(r.map((x) => x.item)).toEqual(['about', 'map']);
    expect(r.every((x) => x.tier === 1)).toBe(true);
  });
});

describe('エッジ: データ側空文字は全 tier 非マッチ', () => {
  it('string[] に空文字', () => {
    const r = search('カ', ['', 'カ']);
    expect(r.map((x) => x.refIndex)).toEqual([1]);
  });
  it('getText が空文字を返す', () => {
    const items = [{ n: '' }, { n: 'カ' }];
    const r = createIndex(items, { getText: (o) => o.n }).search('カ');
    expect(r.map((x) => x.item)).toEqual([items[1]]);
  });
});

describe('エッジ: 重複 item', () => {
  it('それぞれ独立に結果へ（refIndex 昇順）', () => {
    const r = search('カミ', ['カミ', 'カミ', 'カミ']);
    expect(r.map((x) => x.refIndex)).toEqual([0, 1, 2]);
    expect(r.every((x) => x.score === 1)).toBe(true);
  });
});

describe('エッジ: クエリ==データ → score 1.0', () => {
  it('かな入力', () => {
    expect(search('カミナリ', ['カミナリ'])[0]!.score).toBeCloseTo(1, 10);
  });
  it('ローマ字入力', () => {
    expect(search('kaminari', ['カミナリ'])[0]!.score).toBeCloseTo(1, 10);
  });
});

describe('エッジ: サロゲートペア（分断しない）', () => {
  it('絵文字の後ろのカナを正しく特定（matches も UTF-16 区間で整合）', () => {
    const r = search('カ', ['😀カ'], { includeMatches: true });
    expect(r).toHaveLength(1);
    expect(r[0]!.item).toBe('😀カ');
    expect(r[0]!.matches).toEqual([[2, 3]]); // 😀=UTF-16 [0,2)、カ=[2,3)
  });
});
