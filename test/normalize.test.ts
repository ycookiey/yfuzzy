import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalize.js';

describe('normalize (spec 2.1)', () => {
  it('全角スペース U+3000 → 半角スペース', () => {
    const r = normalize('　');
    expect(r.text).toBe(' ');
    expect(r.map).toEqual([[0, 1]]);
  });

  it('全角英数記号 → ASCII', () => {
    expect(normalize('Ａ').text).toBe('a'); // U+FF21 → A → a
    expect(normalize('５').text).toBe('5'); // U+FF15 → 5
    expect(normalize('＿').text).toBe('_'); // U+FF3F → _
  });

  it('ASCII 大文字 → 小文字', () => {
    const r = normalize('ABc');
    expect(r.text).toBe('abc');
    expect(r.map).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('ひらがな → カタカナ', () => {
    expect(normalize('きゅうり').text).toBe('キュウリ');
    expect(normalize('ぁ').text).toBe('ァ'); // 小書きも対象
  });

  it('半角カタカナ → 全角カタカナ', () => {
    expect(normalize('ｱｲｳ').text).toBe('アイウ');
    expect(normalize('ﾎﾟｹﾓﾝ').text).toBe('ポケモン');
  });

  it('半角濁点/半濁点の合成（n:1、map は元区間全体）', () => {
    const r = normalize('ｶﾞ'); // ｶ(U+FF76) + ﾞ(U+FF9E) → ガ
    expect(r.text).toBe('ガ');
    expect(r.map).toEqual([[0, 2]]);
  });

  it('合成: ﾎﾟ → ポ の map は両コードポイントを覆う', () => {
    const r = normalize('ﾎﾟ');
    expect(r.text).toBe('ポ');
    expect(r.map).toEqual([[0, 2]]);
  });

  it('合成: ｳﾞ → ヴ', () => {
    expect(normalize('ｳﾞ').text).toBe('ヴ');
  });

  it('合成不可の組（ｱﾞ）は分離して扱う', () => {
    const r = normalize('ｱﾞ'); // ア + 単独濁点
    expect(r.text).toBe('ア゛');
    expect(r.map).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('漢字・記号は無変換で通す', () => {
    expect(normalize('林').text).toBe('林');
    expect(normalize('・').text).toBe('・');
    expect(normalize('-').text).toBe('-');
  });

  it('サロゲートペアを分断しない（絵文字パススルー）', () => {
    const r = normalize('😀'); // U+1F600, 2 コードユニット
    expect(r.text).toBe('😀');
    expect(r.text.length).toBe(2);
    expect(r.map).toEqual([
      [0, 2],
      [0, 2],
    ]);
  });

  it('複合: ﾛｰﾏ字混じり', () => {
    const r = normalize('ﾚｲ-ｸｯｼｭ');
    expect(r.text).toBe('レイ-クッシュ'); // - はリテラル維持
  });

  it('不変条件: map.length === text.length', () => {
    for (const s of ['', 'abc', 'ｶﾞｷﾞ', 'ぴ😀A５林ー', '　ﾎﾟ']) {
      const r = normalize(s);
      expect(r.map.length).toBe(r.text.length);
    }
  });

  it('空文字', () => {
    const r = normalize('');
    expect(r.text).toBe('');
    expect(r.map).toEqual([]);
  });

  it('map が指す元区間で元文字を切り出せる（matches 逆変換の前提）', () => {
    const raw = 'ﾎﾟｹﾓﾝ';
    const r = normalize(raw);
    // 'ポ' は raw[0..2) = 'ﾎﾟ'
    const [s, e] = r.map[0]!;
    expect(raw.slice(s, e)).toBe('ﾎﾟ');
  });
});
