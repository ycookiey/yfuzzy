// かな→ローマ字変換のコア（spec 2.4）。音節1個（core kana）単位の変換と、
// 促音重ね判定を提供する。全文変換・音節分割は syllable.ts が担う。

import { SINGLE as KUNREI_SINGLE, DIGRAPHS as KUNREI_DIGRAPHS } from './table-kunrei.js';
import { SINGLE as HEPBURN_SINGLE, DIGRAPHS as HEPBURN_DIGRAPHS } from './table-hepburn.js';

export interface RomajiTable {
  readonly single: Record<string, string>;
  readonly digraphs: Record<string, string>;
}

export const KUNREI: RomajiTable = { single: KUNREI_SINGLE, digraphs: KUNREI_DIGRAPHS };
export const HEPBURN: RomajiTable = { single: HEPBURN_SINGLE, digraphs: HEPBURN_DIGRAPHS };

/**
 * core kana（1文字 or 拗音ダイグラフ 2文字、ー/ッ を含まない）をローマ字へ。
 * テーブルに無い文字（漢字・記号・英数）は小文字化してそのまま返す（パススルー）。
 */
export function convertCore(core: string, table: RomajiTable): string {
  if (core.length === 2) {
    const d = table.digraphs[core];
    if (d !== undefined) return d;
  }
  const s = table.single[core];
  if (s !== undefined) return s;
  return core.toLowerCase();
}

/** 促音ッの直後に重ねる対象か（romaji 先頭が子音か）。spec 2.4。 */
export function startsWithConsonant(romaji: string): boolean {
  return /^[bcdfghjklmnpqrstvwxyz]/.test(romaji);
}
