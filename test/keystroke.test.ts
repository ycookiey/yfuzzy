import { describe, it, expect } from 'vitest';
import { createIndex } from '../src/index.js';

// IME をオンにしたまま英字の名前を打った入力（変換途中の文字列。未確定の英字はそのまま残る）。
// 入力は Mozc のローマ字表に沿って打鍵を変換した文字列。
const ITEMS = [
  'Calendar',
  'New Calendar',
  'Camera',
  'カメラ',
  'Center',
  'City Map',
  'Coffee',
  'Kitchen',
  'Quiet Room',
  'Theater',
  'Cherry',
  'Color',
  'Ceremony',
  'Notebook',
  'E-mail',
  'Wheel',
  'Garden',
  'Chocolate',
  'Juice',
  'ジュース',
  'シンジュク',
  'Shinjuku',
];
const index = createIndex(ITEMS);
const top = (q: string) => index.search(q)[0];
const items = (q: string) => index.search(q).map((r) => r.item);

describe('打鍵の解釈: 英単語を IME オンで打った入力（spec 2.2）', () => {
  // [入力, 打った英字, 期待する1位]
  const words: [string, string, string][] = [
    ['かぇんだr', 'calendar', 'Calendar'],
    ['せんてr', 'center', 'Center'],
    ['しty', 'city', 'City Map'],
    ['こっふぇえ', 'coffee', 'Coffee'],
    ['きっちぇn', 'kitchen', 'Kitchen'],
    ['くいえt', 'quiet', 'Quiet Room'],
    ['てぇあてr', 'theater', 'Theater'],
    ['ちぇっry', 'cherry', 'Cherry'],
    ['こぉr', 'color', 'Color'],
    ['せれもny', 'ceremony', 'Ceremony'],
    ['のてぼおk', 'notebook', 'Notebook'],
    ['えーまいl', 'e-mail', 'E-mail'],
    ['うぇえl', 'wheel', 'Wheel'],
    ['がrでn', 'garden', 'Garden'],
    ['ちょこぁて', 'chocolate', 'Chocolate'],
    ['じゅいせ', 'juice', 'Juice'],
  ];
  it.each(words)('%s（%s）→ %s が1位・tier 1', (q, _typed, expected) => {
    expect(top(q)).toMatchObject({ item: expected, tier: 1 });
  });

  // 打ちかけ（前方の数文字）
  const prefixes: [string, string, string][] = [
    ['かぇ', 'cale', 'Calendar'],
    ['せn', 'cen', 'Center'],
    ['こっf', 'coff', 'Coffee'],
    ['くい', 'qui', 'Quiet Room'],
    ['てぇあ', 'thea', 'Theater'],
  ];
  it.each(prefixes)('打ちかけ %s（%s）→ %s が1位', (q, _typed, expected) => {
    expect(top(q)?.item).toBe(expected);
  });

  it('飛び飛びの頭文字（ncal を IME で打った んかl / Shift で N を打った Nかl）', () => {
    expect(top('んかl')).toMatchObject({ item: 'New Calendar', tier: 2 });
    expect(top('Nかl')).toMatchObject({ item: 'New Calendar', tier: 2 });
  });

  it('ハイライトは打った英字に対応する元の文字列の範囲', () => {
    const r = index.search('かぇ', { includeMatches: true });
    expect(r[0]).toMatchObject({ item: 'Calendar', matches: [[0, 4]] });
    const c = index.search('こっふぇえ', { includeMatches: true });
    expect(c[0]).toMatchObject({ item: 'Coffee', matches: [[0, 6]] });
  });

  it('1文字の打ちかけは前方一致の item が部分一致の item より上', () => {
    const r = items('こ');
    const prefixHits = ['Coffee', 'Color', 'カメラ'].filter((x) => r.includes(x));
    expect(prefixHits.length).toBeGreaterThan(0);
    for (const x of ['Coffee', 'Color']) expect(r.indexOf(x)).toBeLessThan(r.indexOf('Chocolate'));
  });
});

describe('打鍵の解釈を足しても日本語の入力の結果は保つ（spec 2.2）', () => {
  it('かなで打てばかなの item が1位', () => {
    expect(top('かめら')?.item).toBe('カメラ');
    expect(top('じゅーす')?.item).toBe('ジュース');
    expect(top('しんじゅく')?.item).toBe('シンジュク');
    expect(top('か')?.item).toBe('カメラ');
  });

  it('同じ読みの英字 item も候補に残る', () => {
    expect(items('かめら')).toContain('Camera');
    expect(items('しんじゅく')).toContain('Shinjuku');
  });

  it('IME オフの英字入力の結果は変わらない', () => {
    expect(top('cale')).toMatchObject({ item: 'Calendar', tier: 1 });
    expect(top('camera')).toMatchObject({ item: 'Camera', tier: 1 });
  });
});
