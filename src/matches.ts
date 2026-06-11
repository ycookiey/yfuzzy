// matches 逆マップ（spec 6章）。tier 1/2 の採用位置（照合空間上）を元文字列上の
// 半開区間 [start, end) へ2段変換し、昇順・隣接/重複マージして返す。
//   1. romaji 位置 → kana 位置（syllableMap 経由。踏んだ音節の kana 全体を含める）
//   2. kana 位置 → 元文字列位置（normMap 経由。n:1 正規化は元区間全体）
// tier 3/4 は positions=null のため呼ばれない（呼ばれても [] を返す）。

import type { IndexEntry } from './entry.js';
import type { TierMatch } from './tiers/types.js';
import type { Syllable } from './syllable.js';

/** romaji 位置 p を含む音節の kana 位置（音節全体）を返す */
function romajiPosToKana(p: number, syllables: readonly Syllable[]): number[] {
  for (const s of syllables) {
    if (p >= s.romajiStart && p < s.romajiStart + s.romajiLen) {
      const out: number[] = [];
      for (let k = 0; k < s.kanaLen; k++) out.push(s.kanaStart + k);
      return out;
    }
  }
  return [];
}

/** spans を昇順ソートし、重複・隣接（半開区間で接する）を連続区間にマージ */
function mergeSpans(spans: [number, number][]): [number, number][] {
  if (spans.length === 0) return [];
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) {
      if (e > last[1]) last[1] = e;
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

/**
 * 採用位置から元文字列上の一致区間を算出する。
 * match.positions が null（tier 3/4）の場合は [] を返す（呼び出し側で undefined 扱い）。
 */
export function computeMatches(entry: IndexEntry, match: TierMatch): [number, number][] {
  if (match.positions === null) return [];

  // 1. 照合空間の位置 → kana 位置
  const kanaPositions = new Set<number>();
  if (match.space === 'kana') {
    for (const p of match.positions) kanaPositions.add(p);
  } else {
    const form = match.space === 'kunrei' ? entry.kunrei : entry.hepburn;
    if (form) {
      for (const p of match.positions) {
        for (const kp of romajiPosToKana(p, form.syllables)) kanaPositions.add(kp);
      }
    }
  }

  // 2. kana 位置 → 元文字列の span（normMap）
  const map = entry.kana.map;
  const spans: [number, number][] = [];
  for (const kp of kanaPositions) {
    const span = map[kp];
    if (span) spans.push([span[0], span[1]]);
  }

  return mergeSpans(spans);
}
