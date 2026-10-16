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
      kind: 'prefix',
      intraScore: 1,
      space: 'kana',
      positions: [0, 1],
    });
  });

  it('かな前方一致 → 先頭の段（3 + coverage × 1.0）/ 4', () => {
    const m = run('カミ', 'カミナリ');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [0, 1] });
    expect(m!.intraScore).toBeCloseTo((3 + 0.5) / 4, 10); // 2/4 × 1.0
  });

  it('かな部分一致（単語の途中）→ 途中の段（0 + coverage × 0.9）/ 4、位置は idx から', () => {
    const m = run('ミナ', 'カミナリ');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [1, 2] });
    expect(m!.intraScore).toBeCloseTo((0 + 0.45) / 4, 10); // 2/4 × 0.9
  });

  it('単語の頭からの部分一致 → 単語の頭の段（2 + coverage × 0.9）/ 4', () => {
    const m = runLiteral('co', 'source code');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [7, 8] });
    expect(m!.intraScore).toBeCloseTo((2 + (2 / 11) * 0.9) / 4, 10);
  });

  it('単語の頭が途中の出現より後ろでも単語の頭の出現を採る', () => {
    expect(runLiteral('co', 'disco code')).toMatchObject({ positions: [6, 7] });
  });

  it('頭文字の一致 → 頭文字の段（1 + coverage × 0.9）/ 4', () => {
    const m = runLiteral('ac', 'apple cider');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [0, 6] });
    expect(m!.intraScore).toBeCloseTo((1 + (2 / 11) * 0.9) / 4, 10);
  });

  it('頭文字は単語の中で続けてから次の単語の頭へ飛べる', () => {
    expect(runLiteral('goca', 'gold case')).toMatchObject({ positions: [0, 1, 5, 6] });
  });

  it('大文字の区切りも単語の頭（AirCooler の C）', () => {
    expect(runLiteral('ac', 'AirCooler')).toMatchObject({ positions: [0, 3] });
  });

  it('段の順: 先頭 > 単語の頭 > 頭文字 > 単語の途中（長さによらない）', () => {
    const prefix = runLiteral('ac', 'acoustic guitar amplifier')!.intraScore;
    const word = runLiteral('ac', 'big acorn')!.intraScore;
    const ini = runLiteral('ac', 'apple cider')!.intraScore;
    const inner = runLiteral('ac', 'back')!.intraScore;
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(ini);
    expect(ini).toBeGreaterThan(inner);
  });

  it('romaji 空間の単語の頭はかなの単語の頭に対応する音節の先頭', () => {
    const m = run('tawa', 'トウキョウ タワー');
    expect(m).toMatchObject({ tier: 1, space: 'kunrei' });
    expect(m!.intraScore).toBeGreaterThan(0.5); // 単語の頭の段
    expect(run('kyou', 'トウキョウ タワー')!.intraScore).toBeLessThan(0.25); // 単語の途中の段
  });

  it('かな不一致でも romaji 前方一致で拾う（長音ロバスト: keki → ケーキ）', () => {
    const m = run('keki', 'ケーキ');
    expect(m).toMatchObject({ tier: 1, space: 'kunrei', positions: [0, 1, 2, 3] });
    expect(m!.intraScore).toBeCloseTo((3 + 0.97) / 4, 10); // 4/4 × 0.97
  });

  it('非マッチは null', () => {
    expect(run('ソラ', 'カミナリ')).toBeNull();
  });

  it('romaji:false ではかな空間のみ（romaji 専用一致は拾わない）', () => {
    expect(run('keki', 'ケーキ', false)).toBeNull();
  });
});

describe('tier1Exact: 1文字クエリ（literal 経路 + 段、spec 2.2/4.1）', () => {
  it('母音1文字は literal 経路で ASCII 中間一致を拾う', () => {
    const m = runLiteral('a', 'map');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [1] });
    expect(m!.intraScore).toBeCloseTo(((1 / 3) * 0.9) / 4, 10); // 単語の途中の段
  });

  it('n も literal 経路で中間一致を拾う', () => {
    const m = runLiteral('n', 'wind');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [2] });
    expect(m!.intraScore).toBeCloseTo(((1 / 4) * 0.9) / 4, 10);
  });

  it('phonetic 経路では母音1文字はかな化され ASCII 中間一致しない', () => {
    expect(run('a', 'map')).toBeNull();
  });

  it('literal 経路の前方一致は romaji 前方一致（×0.97）より高い', () => {
    const m = runLiteral('a', 'about');
    expect(m).toMatchObject({ tier: 1, space: 'kana', positions: [0] });
    expect(m!.intraScore).toBeCloseTo((3 + (1 / 5) * 1.0) / 4, 10); // 先頭の段
    expect(m!.intraScore).toBeGreaterThan(run('a', 'about')!.intraScore);
  });

  it('かな入力は literal 経路でもかなのまま（ア は ASCII 中間一致しない）', () => {
    expect(runLiteral('ア', 'map')).toBeNull();
  });

  it('先頭の段 (0.75,1] と単語の途中の段 (0,0.25] のレンジ分離（子音も対象）', () => {
    expect(run('g', 'green')!.intraScore).toBeGreaterThan(0.75); // 先頭
    expect(run('g', 'ring')!.intraScore).toBeLessThanOrEqual(0.25); // 単語の途中
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

  it('2文字以上のクエリも同じ段で分離する', () => {
    expect(run('カミ', 'カミナリ')!.intraScore).toBeCloseTo((3 + 0.5) / 4, 10);
  });
});
