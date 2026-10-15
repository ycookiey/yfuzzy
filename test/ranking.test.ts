import { describe, it, expect } from 'vitest';
import { createIndex } from '../src/index.js';

// 一致の仕方による順位（spec 5章）。上の段ほど先に並ぶ:
//   1. item の先頭から一致        2. 単語の頭から一致（空白・記号の後、大文字の区切り）
//   3. 各単語の頭文字に一致        4. 単語の途中に一致        5. 飛び飛びに一致
// 同じ段の中の順は問わない。

/** groups の段の順に並ぶこと（各段の item がすべて結果にあり、前の段の item が後の段より上）を確かめる */
function expectGroups(items: readonly string[], query: string, groups: readonly (readonly string[])[]): void {
  const result = createIndex(items)
    .search(query)
    .map((r) => r.item);
  const rank = (x: string): number => {
    const i = result.indexOf(x);
    expect(i, `${query}: ${x} が結果に無い（${result.join(', ')}）`).toBeGreaterThanOrEqual(0);
    return i;
  };
  for (let g = 0; g + 1 < groups.length; g++) {
    const worstUpper = Math.max(...groups[g]!.map(rank));
    const bestLower = Math.min(...groups[g + 1]!.map(rank));
    expect(worstUpper, `${query}: [${groups[g]!.join(', ')}] が [${groups[g + 1]!.join(', ')}] より上（${result.join(', ')}）`).toBeLessThan(bestLower);
  }
}

describe('一致の仕方による順位（spec 5章）', () => {
  it('ac: 先頭 > 頭文字 > 単語の途中 > 飛び飛び', () => {
    expectGroups(['Back', 'AC Adapter', 'Apple Cider', 'AirCooler', 'Play Console', 'Attendance'], 'ac', [
      ['AC Adapter'],
      ['Apple Cider', 'AirCooler'],
      ['Back'],
      ['Play Console', 'Attendance'],
    ]);
  });

  it('co: 先頭 > 単語の頭 > 単語の途中 > 飛び飛び', () => {
    expectGroups(['Discount', 'Cloud Folder', 'Source Code', 'Color Picker', 'Play Console', 'Coffee', 'AutoCorrect'], 'co', [
      ['Coffee', 'Color Picker'],
      ['Source Code', 'Play Console', 'AutoCorrect'],
      ['Discount'],
      ['Cloud Folder'],
    ]);
  });

  it('ca: 先頭 > 単語の頭 > 頭文字 > 単語の途中 > 飛び飛び', () => {
    expectGroups(['Local Map', 'Cobra', 'Classic Art', 'Wall Calendar', 'Camera'], 'ca', [
      ['Camera'],
      ['Wall Calendar'],
      ['Classic Art'], // 頭文字（Classic Art）
      ['Local Map'],
      ['Cobra'],
    ]);
  });

  it('頭文字は単語の頭の続きも打てる（goca → GOld CAse）', () => {
    expectGroups(['Gold Case', 'Gocart'], 'goca', [['Gocart'], ['Gold Case']]);
    expectGroups(['Gold Case', 'Ego Cable'], 'goca', [['Gold Case'], ['Ego Cable']]);
  });

  it('かなの item でも先頭の一致が途中の一致より上（長さによらない）', () => {
    expectGroups(['シンジュク', 'ジュクレンシャ'], 'じゅく', [['ジュクレンシャ'], ['シンジュク']]);
  });

  it('IME オンで打った入力（co → こ）も先頭 > 単語の頭 > 単語の途中', () => {
    expectGroups(['Discount', 'Source Code', 'Color Picker', 'Play Console', 'Coffee'], 'こ', [
      ['Coffee', 'Color Picker'],
      ['Source Code', 'Play Console'],
      ['Discount'],
    ]);
  });

  it('IME オンで打った入力でも単語の頭 > 頭文字（長さによらない。co → こ）', () => {
    expectGroups(['Cash Order', 'Big Coat Hanger Rack'], 'こ', [['Big Coat Hanger Rack'], ['Cash Order']]);
  });

  it('IME オンで打った入力（ac → あc）も同じ順', () => {
    expectGroups(['Back', 'AC Adapter', 'Apple Cider', 'AirCooler'], 'あc', [
      ['AC Adapter'],
      ['Apple Cider', 'AirCooler'],
      ['Back'],
    ]);
  });
});
