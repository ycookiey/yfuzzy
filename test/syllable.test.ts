import { describe, it, expect } from 'vitest';
import {
  splitKanaSegments,
  buildRomajiForm,
  toRomajiForm,
  kanaBoundaries,
} from '../src/syllable.js';
import { KUNREI } from '../src/romaji/convert.js';

describe('splitKanaSegments (spec 2.5)', () => {
  it('促音ッは次音節へ帰属（kanaStart はッ位置、kanaLen に算入）', () => {
    const segs = splitKanaSegments('ニッポン');
    expect(segs.map((s) => s.core)).toEqual(['ニ', 'ポ', 'ン']);
    expect(segs[1]).toMatchObject({ core: 'ポ', sokuon: true, kanaStart: 1, kanaLen: 2 });
    expect(segs[0]).toMatchObject({ kanaStart: 0, kanaLen: 1 });
    expect(segs[2]).toMatchObject({ kanaStart: 3, kanaLen: 1 });
  });

  it('長音ーは直前音節へ帰属（kanaLen を +1）', () => {
    const segs = splitKanaSegments('スーパー');
    expect(segs.map((s) => s.core)).toEqual(['ス', 'パ']);
    expect(segs[0]).toMatchObject({ kanaStart: 0, kanaLen: 2 });
    expect(segs[1]).toMatchObject({ kanaStart: 2, kanaLen: 2 });
  });

  it('拗音ダイグラフは2文字で1音節', () => {
    const segs = splitKanaSegments('キャク');
    expect(segs.map((s) => s.core)).toEqual(['キャ', 'ク']);
    expect(segs[0]).toMatchObject({ kanaStart: 0, kanaLen: 2 });
    expect(segs[1]).toMatchObject({ kanaStart: 2, kanaLen: 1 });
  });

  it('末尾ッは無帰属で破棄', () => {
    const segs = splitKanaSegments('アッ');
    expect(segs.map((s) => s.core)).toEqual(['ア']);
    expect(segs[0]).toMatchObject({ kanaStart: 0, kanaLen: 1 });
  });

  it('先頭ーは無帰属', () => {
    const segs = splitKanaSegments('ーカ');
    expect(segs.map((s) => s.core)).toEqual(['カ']);
    expect(segs[0]).toMatchObject({ kanaStart: 1, kanaLen: 1 });
  });

  it('非かな文字は1文字1音節', () => {
    const segs = splitKanaSegments('カ-キ');
    expect(segs.map((s) => s.core)).toEqual(['カ', '-', 'キ']);
  });
});

describe('buildRomajiForm (spec 2.5)', () => {
  it('促音: ニッポン → nippon、音節対応', () => {
    const form = buildRomajiForm(splitKanaSegments('ニッポン'), KUNREI);
    expect(form.text).toBe('nippon');
    expect(form.syllables).toEqual([
      { kanaStart: 0, kanaLen: 1, romajiStart: 0, romajiLen: 2 },
      { kanaStart: 1, kanaLen: 2, romajiStart: 2, romajiLen: 3 },
      { kanaStart: 3, kanaLen: 1, romajiStart: 5, romajiLen: 1 },
    ]);
    expect(form.boundaries).toEqual(new Set([0, 2, 5]));
  });

  it('長音: スーパー → supa、ーは直前音節の kana 区間に入る', () => {
    const form = toRomajiForm('スーパー', KUNREI);
    expect(form.text).toBe('supa');
    expect(form.syllables).toEqual([
      { kanaStart: 0, kanaLen: 2, romajiStart: 0, romajiLen: 2 },
      { kanaStart: 2, kanaLen: 2, romajiStart: 2, romajiLen: 2 },
    ]);
    // romaji 'su'(0-2) を踏むと kana [0,2) = 'スー' 全体が対象（ハイライト虫食い防止）
    expect(form.boundaries).toEqual(new Set([0, 2]));
  });

  it('romaji 境界 = 各音節の先頭（頭文字救済の基盤）', () => {
    const form = toRomajiForm('カミナリ', KUNREI); // kaminari
    expect(form.text).toBe('kaminari');
    expect(form.boundaries).toEqual(new Set([0, 2, 4, 6]));
  });
});

describe('kanaBoundaries (spec 2.6)', () => {
  it('全かなは先頭のみ', () => {
    expect(kanaBoundaries('カミナリ')).toEqual(new Set([0]));
  });
  it('separator の直後が境界', () => {
    expect(kanaBoundaries('カ-キ')).toEqual(new Set([0, 2]));
  });
  it('漢字の直後が境界', () => {
    expect(kanaBoundaries('林カ')).toEqual(new Set([0, 1]));
  });
  it('末尾の非かなの後ろ（範囲外）は追加しない', () => {
    expect(kanaBoundaries('カ-')).toEqual(new Set([0]));
  });
});
