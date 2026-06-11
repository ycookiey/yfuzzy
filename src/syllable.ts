// 音節分割と kana↔romaji 位置対応（spec 2.5）、境界集合（spec 2.6）。
//
// 帰属規則（matches のハイライト虫食い防止）:
//   - 促音ッ: 次音節の kana 区間に含める（kanaStart はッの位置、kanaLen に算入）。
//     romaji は子音重ねとして反映。次音節が無い末尾ッは無帰属（破棄）。
//   - 長音ー: 直前音節の kana 区間に含める（kanaLen を +1、romaji は持たない）。
//     直前音節が無い先頭ーは無帰属。

import { convertCore, startsWithConsonant, type RomajiTable } from './romaji/convert.js';

/** 音節1個の kana↔romaji 位置対応 */
export interface Syllable {
  readonly kanaStart: number;
  readonly kanaLen: number;
  readonly romajiStart: number;
  readonly romajiLen: number;
}

/** romaji 1方式分の表現 */
export interface RomajiForm {
  readonly text: string;
  readonly syllables: readonly Syllable[];
  /** romaji 空間の境界位置（spec 2.6: 各音節の先頭 = 全 romajiStart） */
  readonly boundaries: ReadonlySet<number>;
}

/** kana 文字列のセグメント（方式非依存。romaji 変換前） */
export interface KanaSegment {
  /** romaji 変換対象の core kana（ー/ッ を含まない 1〜2 文字、または非かな1文字） */
  core: string;
  /** 直前に促音ッが繰り越されたか（romaji 先頭子音を重ねる） */
  sokuon: boolean;
  /** kana 文字列上の開始（繰り越しッを含む） */
  kanaStart: number;
  /** kana 文字列上の長さ（繰り越しッ・後続ー を含む） */
  kanaLen: number;
}

const SOKUON = 'ッ';
const LONG_VOWEL = 'ー';
const SMALL_KANA = new Set(['ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ャ', 'ュ', 'ョ', 'ヮ']);
const KANA_RE = /[ァ-ヺー]/; // カタカナ音節 + ー（・U+30FB は除外）
const KANA_BASE_RE = /[ァ-ヺ]/; // ダイグラフ先頭になりうるカタカナ
const ALNUM_RE = /[0-9a-z]/;

function isKanaOrAlnum(ch: string): boolean {
  return KANA_RE.test(ch) || ALNUM_RE.test(ch);
}

/** kana を音節セグメントへ分割する（ー/ッ 帰属規則込み） */
export function splitKanaSegments(kana: string): KanaSegment[] {
  const segments: KanaSegment[] = [];
  let i = 0;
  let pendingSokuon = false;
  let sokuonStart = -1;

  while (i < kana.length) {
    const ch = kana[i]!;

    if (ch === SOKUON) {
      if (!pendingSokuon) {
        pendingSokuon = true;
        sokuonStart = i;
      }
      i += 1;
      continue;
    }

    if (ch === LONG_VOWEL) {
      const last = segments[segments.length - 1];
      if (last) last.kanaLen += 1; // 直前音節へ帰属（先頭ーは無帰属）
      i += 1;
      continue;
    }

    const start = pendingSokuon ? sokuonStart : i;
    const next = i + 1 < kana.length ? kana[i + 1]! : '';
    const consumed = next !== '' && SMALL_KANA.has(next) && KANA_BASE_RE.test(ch) ? 2 : 1;
    const core = kana.slice(i, i + consumed);
    segments.push({ core, sokuon: pendingSokuon, kanaStart: start, kanaLen: i + consumed - start });
    pendingSokuon = false;
    sokuonStart = -1;
    i += consumed;
  }

  // 末尾ッ（pendingSokuon 残り）は無帰属で破棄
  return segments;
}

/** セグメント列を指定方式の RomajiForm へ変換する */
export function buildRomajiForm(segments: readonly KanaSegment[], table: RomajiTable): RomajiForm {
  const syllables: Syllable[] = [];
  const boundaries = new Set<number>();
  let cursor = 0;
  let text = '';

  for (const seg of segments) {
    let r = convertCore(seg.core, table);
    if (seg.sokuon && r.length > 0 && startsWithConsonant(r)) {
      r = r[0]! + r;
    }
    boundaries.add(cursor);
    syllables.push({ kanaStart: seg.kanaStart, kanaLen: seg.kanaLen, romajiStart: cursor, romajiLen: r.length });
    cursor += r.length;
    text += r;
  }

  return { text, syllables, boundaries };
}

/** kana 文字列から RomajiForm を直接生成（データ側 Index 構築用） */
export function toRomajiForm(kana: string, table: RomajiTable): RomajiForm {
  return buildRomajiForm(splitKanaSegments(kana), table);
}

/** kana 文字列のローマ字（位置不要のクエリ側用） */
export function kanaToRomaji(kana: string, table: RomajiTable): string {
  return toRomajiForm(kana, table).text;
}

/** かな空間の境界位置（spec 2.6: 先頭 + カナ・英数字以外の直後） */
export function kanaBoundaries(kana: string): Set<number> {
  const boundaries = new Set<number>([0]);
  for (let i = 0; i < kana.length; i++) {
    if (!isKanaOrAlnum(kana[i]!)) {
      const after = i + 1;
      if (after < kana.length) boundaries.add(after);
    }
  }
  return boundaries;
}
