import { describe, it, expect } from 'vitest';
import { convertCore, startsWithConsonant, KUNREI, HEPBURN } from '../src/romaji/convert.js';
import { kanaToRomaji } from '../src/syllable.js';

describe('convertCore (spec 2.4)', () => {
  it('単音・ダイグラフ（訓令）', () => {
    expect(convertCore('カ', KUNREI)).toBe('ka');
    expect(convertCore('シ', KUNREI)).toBe('si');
    expect(convertCore('キャ', KUNREI)).toBe('kya');
    expect(convertCore('シャ', KUNREI)).toBe('sya');
  });
  it('単音・ダイグラフ（ヘボン）', () => {
    expect(convertCore('シ', HEPBURN)).toBe('shi');
    expect(convertCore('チ', HEPBURN)).toBe('chi');
    expect(convertCore('ツ', HEPBURN)).toBe('tsu');
    expect(convertCore('シャ', HEPBURN)).toBe('sha');
    expect(convertCore('ジャ', HEPBURN)).toBe('ja');
  });
  it('テーブルに無い文字はパススルー（小文字化）', () => {
    expect(convertCore('林', KUNREI)).toBe('林');
    expect(convertCore('-', KUNREI)).toBe('-');
    expect(convertCore('1', KUNREI)).toBe('1');
  });
  it('startsWithConsonant', () => {
    expect(startsWithConsonant('po')).toBe(true);
    expect(startsWithConsonant('a')).toBe(false);
    expect(startsWithConsonant('n')).toBe(true);
  });
});

describe('kanaToRomaji (spec 2.4, 全文)', () => {
  it('促音重ね', () => {
    expect(kanaToRomaji('ニッポン', KUNREI)).toBe('nippon');
    expect(kanaToRomaji('キット', KUNREI)).toBe('kitto');
  });
  it('長音は削除', () => {
    expect(kanaToRomaji('スーパー', KUNREI)).toBe('supa');
    expect(kanaToRomaji('ラーメン', KUNREI)).toBe('ramen');
  });
  it('拗音・外来音', () => {
    expect(kanaToRomaji('ファイト', KUNREI)).toBe('faito');
    expect(kanaToRomaji('ヴァイオリン', KUNREI)).toBe('vaiorin');
  });
  it('方式差', () => {
    // シ + チュ + ー（長音削除）
    expect(kanaToRomaji('シチュー', KUNREI)).toBe('sityu');
    expect(kanaToRomaji('シチュー', HEPBURN)).toBe('shichu');
  });
  it('非かな混在', () => {
    expect(kanaToRomaji('カ1', KUNREI)).toBe('ka1');
    expect(kanaToRomaji('林カ', KUNREI)).toBe('林ka');
  });
});
