import { describe, it, expect } from 'vitest';
import { tier1Exact } from '../src/tiers/tier1-exact.js';
import { buildEntry } from '../src/entry.js';
import { normalizeQuery } from '../src/query.js';
import type { RomajiOption } from '../src/romaji/convert.js';

function run(query: string, data: string, romaji: RomajiOption = 'both') {
  return tier1Exact(normalizeQuery(query, romaji), buildEntry(data, 0, romaji));
}

function runLiteral(query: string, data: string) {
  return tier1Exact(normalizeQuery(query, 'both', 'literal'), buildEntry(data, 0, 'both'));
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

describe('tier1Exact: 1文字クエリ（literal 経路 + レンジ分離、spec 2.2/4.1）', () => {
  it('母音1文字は literal 経路で ASCII 中間一致を拾う', () => {
    const m = runLiteral('a', 'map');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [1] });
    expect(m!.intraScore).toBeCloseTo(((1 / 3) * 0.9) / 2, 10); // 部分一致系 = raw/2
  });

  it('n も literal 経路で中間一致を拾う', () => {
    const m = runLiteral('n', 'wind');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [2] });
    expect(m!.intraScore).toBeCloseTo(((1 / 4) * 0.9) / 2, 10);
  });

  it('phonetic 経路では母音1文字はかな化され ASCII 中間一致しない', () => {
    expect(run('a', 'map')).toBeNull();
  });

  it('literal 経路の前方一致は romaji 前方一致（×0.97）より高い', () => {
    const m = runLiteral('a', 'about');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [0] });
    expect(m!.intraScore).toBeCloseTo(0.5 + ((1 / 5) * 1.0) / 2, 10); // 前方一致系 = 0.5 + raw/2
    expect(m!.intraScore).toBeGreaterThan(run('a', 'about')!.intraScore);
  });

  it('かな入力は literal 経路でもかなのまま（ア は ASCII 中間一致しない）', () => {
    expect(runLiteral('ア', 'map')).toBeNull();
  });

  it('前方一致系 (0.5,1] と部分一致系 (0,0.5] のレンジ分離（子音も対象）', () => {
    expect(run('g', 'green')!.intraScore).toBeGreaterThan(0.5); // かな前方
    expect(run('g', 'ring')!.intraScore).toBeLessThanOrEqual(0.5); // かな部分
  });

  it('coverage 差では逆転しない（長いデータの前方 > 短いデータの部分）', () => {
    expect(runLiteral('a', 'aquamarine')!.intraScore).toBeGreaterThan(
      runLiteral('a', 'map')!.intraScore,
    );
  });

  it('1文字完全一致は 1.0 のまま', () => {
    expect(run('x', 'x')!.intraScore).toBe(1);
    expect(run('カ', 'カ')!.intraScore).toBe(1);
  });

  it('2文字以上のクエリはレンジ分離しない（従来スコア）', () => {
    expect(run('カミ', 'カミナリ')!.intraScore).toBeCloseTo(0.5, 10);
  });
});
