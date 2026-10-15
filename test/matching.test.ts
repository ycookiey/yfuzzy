import { describe, it, expect } from 'vitest';
import { createIndex, search } from '../src/index.js';

describe('matching: both（既定、spec 2.2）', () => {
  it('英字データへの英字クエリは literal 経路で前方一致する', () => {
    const r = search('cale', ['Calendar', 'Garden']);
    expect(r[0]).toMatchObject({ item: 'Calendar', tier: 1 });
  });

  it('かなデータへのローマ字クエリは phonetic 経路で一致する', () => {
    const r = search('sinjuku', ['シンジュク', 'シブヤ']);
    expect(r[0]).toMatchObject({ item: 'シンジュク', tier: 1 });
  });

  it('literal 経路の一致は入力どおりの位置をハイライトする', () => {
    const r = search('cale', ['Calendar'], { includeMatches: true });
    expect(r[0]?.matches).toEqual([[0, 4]]);
  });

  it('literal で当たらない英字は phonetic 経路で拾う', () => {
    // chi は stitch に連続して現れないが、チ → 訓令 ti が部分一致する
    const r = search('chi', ['stitch'], { includeMatches: true });
    expect(r[0]).toMatchObject({ item: 'stitch', tier: 1 });
    expect(r[0]?.matches).toEqual([[1, 3]]);
  });

  it('同点時は literal 経路の一致を採る（spec 5章）', () => {
    // a は literal で位置1、phonetic（ア）で位置2に部分一致し、score が等しい
    const both = search('a', ['xaア'], { includeMatches: true });
    const phonetic = createIndex(['xaア'], { matching: 'phonetic' }).search('a', {
      includeMatches: true,
    });
    expect(both[0]?.score).toBe(phonetic[0]?.score);
    expect(both[0]?.matches).toEqual([[1, 2]]);
    expect(phonetic[0]?.matches).toEqual([[2, 3]]);
  });
});

describe('matching: literal（spec 2.2）', () => {
  const index = createIndex(['Calendar', 'Colorful', 'Outdoor', 'メール', 'シンジュク', 'カミナリ'], {
    matching: 'literal',
  });

  it('英字データへの英字クエリが前方一致する', () => {
    expect(index.search('cale')[0]?.item).toBe('Calendar');
    expect(index.search('colorf')[0]?.item).toBe('Colorful');
    expect(index.search('outdoor')[0]?.item).toBe('Outdoor');
  });

  it('ひらがなは正規化でカタカナデータに一致する', () => {
    const r = index.search('めーる');
    expect(r[0]).toMatchObject({ item: 'メール', score: 1 });
  });

  it('ローマ字はかなに変換しない', () => {
    expect(index.search('sinjuku')).toEqual([]);
    expect(index.search('kmnr')).toEqual([]);
  });
});

describe('matching: phonetic（spec 2.2）', () => {
  const index = createIndex(['Calendar', 'Colorful', 'シンジュク', 'カミナリ'], {
    matching: 'phonetic',
  });

  it('英字クエリはかなに変換されるため英字データに一致しない', () => {
    expect(index.search('cale').map((r) => r.item)).not.toContain('Calendar');
    expect(index.search('colorf').map((r) => r.item)).not.toContain('Colorful');
  });

  it('ローマ字・子音のみのクエリがかなデータに一致する', () => {
    expect(index.search('sinjuku')[0]).toMatchObject({ item: 'シンジュク', tier: 1 });
    expect(index.search('kmnr')[0]?.item).toBe('カミナリ');
  });
});
