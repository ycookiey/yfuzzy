import { describe, it, expect } from 'vitest';
import { createIndex } from '../src/index.js';

// 長音を打ったローマ字（母音の重なり・IME 式の -）で、長音「ー」を含む item に直接一致する（spec 2.2）
const index = createIndex([
  'サーバー',
  'コーヒー',
  'センター',
  'オバアサン',
  'オバサン',
  'オジイサン',
  'オジサン',
  'オオカミ',
  'オカミ',
  'コオリ',
  'コリ',
  'ビール',
  'ビル',
  'セーター',
  'セタ',
]);
const tier1 = (q: string) => index.search(q, { maxTier: 1 }).map((r) => r.item);

describe('長音を打ったローマ字（spec 2.2）', () => {
  it.each([
    ['saabaa', 'サーバー'],
    ['sa-ba-', 'サーバー'],
    ['koohii', 'コーヒー'],
    ['ko-hi-', 'コーヒー'],
    ['sentaa', 'センター'],
    ['seetaa', 'セーター'],
  ])('%s → %s が tier 1', (q, expected) => {
    expect(tier1(q)[0]).toBe(expected);
  });

  it.each([['saa'], ['saab'], ['saaba'], ['sa-'], ['sa-b']])('打ちかけ %s でも サーバー', (q) => {
    expect(tier1(q)).toContain('サーバー');
  });

  it('長音のない別の語には当てない', () => {
    expect(tier1('biiru')).toEqual(['ビール']);
    expect(tier1('obaasan')).toEqual(['オバアサン']);
    expect(tier1('ojiisan')).toEqual(['オジイサン']);
    expect(tier1('ookami')).toEqual(['オオカミ']);
    expect(tier1('koori')).toEqual(['コオリ']);
  });

  it('長音を省いた入力は今までどおり', () => {
    expect(tier1('saba')).toContain('サーバー');
    expect(tier1('kohi')).toContain('コーヒー');
  });
});
