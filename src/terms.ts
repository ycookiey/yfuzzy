// 複数の語（spec 2.7）。空白で区切った語をすべて含む item に絞る。
// 各語は tier 1 の直接一致だけを認め（1 文字の語は先頭・単語の頭だけ）、別の語は別の単語に当てる。
// 語の順番は問わない。item ごとに、語ごとの出現から 1 つずつ選んだ組み合わせのうち、
// 弱い語の段 → 順番どおりか → 弱い語の素点 の順に最良のものを採る。

import type { NormalizedQuery } from './query.js';
import type { IndexEntry } from './entry.js';
import type { Space, TierMatch } from './tiers/types.js';
import { contiguousAt, type ContiguousMatch } from './lattice.js';
import { romajiPosToKana } from './matches.js';
import {
  grade,
  initials,
  KIND_OF_CLASS,
  KANA_PREFIX,
  KANA_SUBSTRING,
  ROMAJI_PREFIX,
  ROMAJI_SUBSTRING,
  HEPBURN_PENALTY,
  PREFIX,
  WORD,
  INNER,
  tier1Exact,
} from './tiers/tier1-exact.js';

/** 語の 1 つの出現 */
interface Occurrence {
  /** 段（PREFIX・WORD・INITIALS・INNER） */
  readonly cls: number;
  /** 素点（coverage × 係数） */
  readonly raw: number;
  /** 当たった単語の番号（昇順） */
  readonly words: readonly number[];
  /** ハイライト用（tier 1 の一致として） */
  readonly match: TierMatch;
}

/** item ごとの最良の組み合わせ */
export interface TermsHit {
  /** 弱い語の段 */
  readonly cls: number;
  /** 弱い語の素点 */
  readonly raw: number;
  /** 語の順番どおりに単語が並ぶか */
  readonly ordered: boolean;
  /** 各語の一致（ハイライト用） */
  readonly parts: readonly TierMatch[];
}

/** 組み合わせの総当たりの上限（単語の多い長い item で語ごとの出現が多いときに打ち切る） */
const MAX_COMBINATIONS = 4096;

/** かな空間の位置 p が何番目の単語か（heads は単語の頭の昇順） */
function wordOf(p: number, heads: readonly number[]): number {
  let lo = 0;
  let hi = heads.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (heads[mid]! <= p) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function formOf(e: IndexEntry, space: Space) {
  return space === 'kunrei' ? e.kunrei : space === 'hepburn' ? e.hepburn : space === 'long' ? e.long : null;
}

function headsOf(e: IndexEntry, space: Space): [ReadonlySet<number>, readonly number[]] {
  if (space === 'kunrei') return [e.kunreiHeads, e.kunreiHeadList];
  if (space === 'hepburn') return [e.hepburnHeads, e.hepburnHeadList];
  if (space === 'long') return [e.longHeads, e.longHeadList];
  return [e.kanaBoundaries, e.kanaHeadList];
}

/** 語の出現を、当たった単語の番号つきで記録する。1 文字の語は先頭・単語の頭だけ */
function record(
  out: Occurrence[],
  e: IndexEntry,
  single: boolean,
  space: Space,
  positions: number[],
  cls: number,
  raw: number,
): void {
  if (single && cls < WORD) return;
  const kanaPositions =
    space === 'kana' ? positions : positions.flatMap((p) => romajiPosToKana(p, formOf(e, space)!.syllables));
  const words = [...new Set(kanaPositions.map((p) => wordOf(p, e.kanaHeadList)))].sort((a, b) => a - b);
  const match: TierMatch = { tier: 1, kind: KIND_OF_CLASS[cls]!, intraScore: grade(cls, raw), space, positions };
  out.push({ cls, raw, words, match });
}

function range(offset: number, len: number): number[] {
  return Array.from({ length: len }, (_, i) => offset + i);
}

/** 文字列の語のすべての出現（前方・単語の頭・単語の途中）と頭文字の一致 */
function stringOccurrences(
  out: Occurrence[],
  e: IndexEntry,
  single: boolean,
  query: string,
  data: string,
  space: Space,
  prefixFactor: number,
  substringFactor: number,
  minLen: number,
  qMask: number,
  dMask: number,
): void {
  if (query.length === 0 || data.length === 0 || (qMask & ~dMask) !== 0) return;
  const [heads, headList] = headsOf(e, space);
  const n = data.length;
  for (let s = data.indexOf(query); s >= 0; s = data.indexOf(query, s + 1)) {
    const cls = s === 0 ? PREFIX : heads.has(s) ? WORD : INNER;
    if (cls !== PREFIX && query.length < minLen) continue;
    const factor = cls === PREFIX ? prefixFactor : substringFactor;
    record(out, e, single, space, range(s, query.length), cls, (query.length / n) * factor);
  }
  const ini = initials(query, data, headList, space, substringFactor);
  if (ini !== null) record(out, e, single, space, ini.positions!, ini.cls, ini.intraScore * 4 - ini.cls);
}

const scratchMatch: ContiguousMatch = { plain: 0, ks: 0 };

/** 1 つの語（1 経路）の出現を集める（tier 1 と同じ空間・係数） */
function occurrences(out: Occurrence[], q: NormalizedQuery, e: IndexEntry, single: boolean): void {
  const kana = e.kana.text;
  if (q.lattice !== null && e.hasKeystrokeChar) {
    const lat = q.lattice;
    const n = kana.length;
    const add = (s: number, len: number, ks: boolean): void => {
      const cls = s === 0 ? PREFIX : e.kanaBoundaries.has(s) ? WORD : INNER;
      if (ks && cls !== PREFIX && len < 2) return; // 打鍵の部分一致は 2 文字以上
      const factor = ks ? (cls === PREFIX ? ROMAJI_PREFIX : ROMAJI_SUBSTRING) : cls === PREFIX ? KANA_PREFIX : KANA_SUBSTRING;
      record(out, e, single, 'kana', range(s, len), cls, (len / n) * factor);
    };
    if (lat.paths !== null) {
      for (const [p, ks] of lat.paths) for (let s = kana.indexOf(p); s >= 0; s = kana.indexOf(p, s + 1)) add(s, p.length, ks);
    } else {
      for (let s = 0; s < n; s++) {
        if (!lat.firstCodes.has(kana.charCodeAt(s))) continue;
        contiguousAt(lat, kana, s, scratchMatch);
        if (scratchMatch.plain > 0) add(s, scratchMatch.plain, false);
        if (scratchMatch.ks > 0) add(s, scratchMatch.ks, true);
      }
    }
  } else if (!q.shadowed) {
    stringOccurrences(out, e, single, q.kana, kana, 'kana', KANA_PREFIX, KANA_SUBSTRING, 1, q.kanaMask, e.kanaMask);
  }
  if (q.kunrei !== null && e.kunrei !== null) {
    stringOccurrences(out, e, single, q.kunrei, e.kunrei.text, 'kunrei', ROMAJI_PREFIX, ROMAJI_SUBSTRING, 2, q.kunreiMask, e.kunreiMask);
  }
  if (q.hepburn !== null && e.hepburn !== null) {
    const f = HEPBURN_PENALTY;
    stringOccurrences(out, e, single, q.hepburn, e.hepburn.text, 'hepburn', ROMAJI_PREFIX * f, ROMAJI_SUBSTRING * f, 2, q.hepburnMask, e.hepburnMask);
  }
  if (q.long !== null && e.long !== null) {
    stringOccurrences(out, e, single, q.long, e.long.text, 'long', ROMAJI_PREFIX, ROMAJI_SUBSTRING, 2, q.longMask, e.longMask);
  }
}

/** 同じ単語の組に当たる出現は最良の 1 つにまとめ、良い順に並べる */
function compact(occs: Occurrence[]): Occurrence[] {
  const best = new Map<string, Occurrence>();
  for (const o of occs) {
    const key = o.words.join(',');
    const cur = best.get(key);
    if (cur === undefined || o.match.intraScore > cur.match.intraScore) best.set(key, o);
  }
  return [...best.values()].sort((a, b) => b.match.intraScore - a.match.intraScore);
}

/** 組み合わせの良さ: 弱い語の段 → 順番どおりか → 弱い語の素点（大きいほど良い） */
function better(a: TermsHit, b: TermsHit | null): boolean {
  if (b === null) return true;
  if (a.cls !== b.cls) return a.cls > b.cls;
  if (a.ordered !== b.ordered) return a.ordered;
  return a.raw > b.raw;
}

/** 語ごとの出現から、別々の単語に当たる組み合わせのうち最良のものを選ぶ */
function bestCombination(perTerm: Occurrence[][]): TermsHit | null {
  // 総当たりの数を上限に収める（良い順の先頭から残す）
  let lists = perTerm;
  const product = (ls: Occurrence[][]) => ls.reduce((p, l) => p * Math.max(1, l.length), 1);
  for (let keep = 64; product(lists) > MAX_COMBINATIONS && keep > 1; keep >>= 1) lists = perTerm.map((l) => l.slice(0, keep));
  let best: TermsHit | null = null;
  const chosen: Occurrence[] = [];
  const used = new Set<number>();
  const walk = (i: number): void => {
    if (i === lists.length) {
      let weakest = chosen[0]!;
      for (const o of chosen) if (o.match.intraScore < weakest.match.intraScore) weakest = o;
      let ordered = true;
      for (let k = 1; k < chosen.length && ordered; k++) {
        ordered = chosen[k - 1]!.words[chosen[k - 1]!.words.length - 1]! < chosen[k]!.words[0]!;
      }
      const hit: TermsHit = { cls: weakest.cls, raw: weakest.raw, ordered, parts: chosen.map((o) => o.match) };
      if (better(hit, best)) best = hit;
      return;
    }
    for (const o of lists[i]!) {
      if (o.words.some((w) => used.has(w))) continue;
      for (const w of o.words) used.add(w);
      chosen.push(o);
      walk(i + 1);
      chosen.pop();
      for (const w of o.words) used.delete(w);
    }
  };
  walk(0);
  return best;
}

/**
 * 語ごとの正規化済みクエリ（各語の経路の一覧）で照合し、すべての語を含む item の最良の組み合わせを返す。
 * 先にすべての語の tier 1 で item を絞り（2 語目以降は、それまでの語に当たった item だけ）、残った item で出現を集める。
 */
export function matchTerms(
  terms: readonly (readonly NormalizedQuery[])[],
  singles: readonly boolean[],
  entries: readonly IndexEntry[],
): Map<number, TermsHit> {
  // 出現は tier 1 と同じ空間・条件で集めるので、tier 1 に当たらない item には無い。
  // tier 1 は一致が 1 つ見つかれば残りを省けるため、先にすべての語で振るい落としてから出現を集める
  let candidates: readonly IndexEntry[] = entries;
  for (const paths of terms) candidates = candidates.filter((e) => paths.some((q) => tier1Exact(q, e) !== null));
  const hits = new Map<number, TermsHit>();
  for (const e of candidates) {
    const perTerm: Occurrence[][] = [];
    for (let t = 0; t < terms.length; t++) {
      const out: Occurrence[] = [];
      for (const q of terms[t]!) occurrences(out, q, e, singles[t]!);
      if (out.length === 0) break;
      perTerm.push(compact(out));
    }
    if (perTerm.length < terms.length) continue;
    const hit = bestCombination(perTerm);
    if (hit !== null) hits.set(e.refIndex, hit);
  }
  return hits;
}
