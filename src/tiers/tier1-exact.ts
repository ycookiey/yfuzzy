// tier 1: 完全マッチ層（spec 4.1）。クエリ文字列がデータに連続して現れる。
// サブマッチを固定優先順で評価し、intraScore 最大を採用（同点は先順位＝表の記載順）。
// 優先順（spec 5章タイブレーク）: かな前方 > かな部分 > romaji前方(訓令>ヘボン) >
// romaji部分(訓令>ヘボン)。打鍵ラティス（spec 2.2）では入力文字のままの経路がかなの、
// 打鍵を経由した経路が romaji の係数・最小長を取る。

import type { Matcher, Space } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';
import { contiguousAt, latticeFeasible, type ContiguousMatch, type Lattice } from '../lattice.js';

const KANA_PREFIX = 1.0;
const KANA_SUBSTRING = 0.9;
const ROMAJI_PREFIX = 0.97;
const ROMAJI_SUBSTRING = 0.87;
const HEPBURN_PENALTY = 0.99; // 訓令優先（両式同時マッチ時の決定性）

// positions は連続区間 [offset, offset+len) なので offset/len のみ保持し、
// 最終 best 確定後に1回だけ配列化する（非 best 候補の確保を廃す）。
interface Candidate {
  readonly intraScore: number;
  readonly space: Space;
  readonly offset: number;
  readonly len: number;
}

function range(len: number, offset: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < len; i++) p.push(offset + i);
  return p;
}

// 1文字クエリ（正規化後1コードポイント）のレンジ分離（spec 4.1）:
// 前方一致系 = 0.5 + raw/2 ∈ (0.5, 1]、部分一致系 = raw/2 ∈ (0, 0.5]。
// coverage 差で短いデータの部分一致が長いデータの前方一致を逆転しないことを保証する。
// 完全一致（coverage 1.0 の前方）は 1.0 のまま。
function mapScore(raw: number, isPrefix: boolean, single: boolean): number {
  if (!single) return raw;
  return isPrefix ? 0.5 + raw / 2 : raw / 2;
}

function prefix(
  query: string,
  data: string,
  space: Space,
  factor: number,
  single: boolean,
): Candidate | null {
  if (query.length === 0 || data.length === 0) return null;
  if (!data.startsWith(query)) return null;
  const raw = (query.length / data.length) * factor;
  return { intraScore: mapScore(raw, true, single), space, offset: 0, len: query.length };
}

function substring(
  query: string,
  data: string,
  space: Space,
  factor: number,
  minLen: number,
  single: boolean,
): Candidate | null {
  if (query.length < minLen || data.length === 0) return null;
  const idx = data.indexOf(query);
  if (idx <= 0) return null; // 0 = 前方一致（別サブマッチが担当）、<0 = 非一致
  const raw = (query.length / data.length) * factor;
  return { intraScore: mapScore(raw, false, single), space, offset: idx, len: query.length };
}

const scratchMatch: ContiguousMatch = { plain: 0, ks: 0 };

/**
 * ラティスの連続一致候補を優先順（入力文字前方 > 入力文字部分 > 打鍵前方 > 打鍵部分）で渡す。
 * 長さは一致した経路の長さ。部分一致は最長、同長は最も前の位置。
 */
function latticeCandidates(
  lat: Lattice,
  data: string,
  single: boolean,
  consider: (c: Candidate | null) => void,
): void {
  const N = data.length;
  if (N === 0) return;
  let prefPlain = 0;
  let prefKs = 0;
  if (lat.firstChars.has(data[0]!)) {
    contiguousAt(lat, data, 0, scratchMatch);
    prefPlain = scratchMatch.plain;
    prefKs = scratchMatch.ks;
  }
  let subPlain = 0;
  let subPlainAt = -1;
  let subKs = 0;
  let subKsAt = -1;
  for (let s = 1; s < N; s++) {
    if (!lat.firstChars.has(data[s]!)) continue;
    contiguousAt(lat, data, s, scratchMatch);
    if (scratchMatch.plain > subPlain) {
      subPlain = scratchMatch.plain;
      subPlainAt = s;
    }
    if (scratchMatch.ks > subKs) {
      subKs = scratchMatch.ks;
      subKsAt = s;
    }
  }
  const cand = (len: number, at: number, factor: number, isPrefix: boolean): Candidate => ({
    intraScore: mapScore((len / N) * factor, isPrefix, single),
    space: 'kana',
    offset: at,
    len,
  });
  if (prefPlain > 0) consider(cand(prefPlain, 0, KANA_PREFIX, true));
  if (subPlain > 0) consider(cand(subPlain, subPlainAt, KANA_SUBSTRING, false));
  if (prefKs > 0) consider(cand(prefKs, 0, ROMAJI_PREFIX, true));
  if (subKs >= 2) consider(cand(subKs, subKsAt, ROMAJI_SUBSTRING, false));
}

export const tier1Exact: Matcher = (q: NormalizedQuery, e: IndexEntry) => {
  let best: Candidate | null = null;
  // strict > により、同点では先に評価した（＝優先順が上の）候補が残る
  const consider = (c: Candidate | null): void => {
    if (c !== null && (best === null || c.intraScore > best.intraScore)) best = c;
  };

  const kana = e.kana.text;
  const kunrei = e.kunrei?.text ?? '';
  const hepburn = e.hepburn?.text ?? '';
  const single = q.singleChar;

  if (q.lattice !== null && e.hasKeystrokeChar) {
    // 1-2. かな前方/部分一致（入力文字のままの経路）、打鍵経路の前方/部分一致（romaji 係数）。
    // データに打鍵の文字が無ければ打鍵経路は一致し得ないため文字列照合（else）と同値
    if (latticeFeasible(q.lattice, e.kanaMask)) latticeCandidates(q.lattice, kana, single, consider);
  } else if (!q.shadowed) {
    // 1. かな前方一致
    consider(prefix(q.kana, kana, 'kana', KANA_PREFIX, single));
    // 2. かな部分一致（かなは1文字でも可）
    consider(substring(q.kana, kana, 'kana', KANA_SUBSTRING, 1, single));
  }
  // 3. romaji 前方一致（訓令 → ヘボン。前方は最小長条件なし）
  if (q.kunrei !== null) consider(prefix(q.kunrei, kunrei, 'kunrei', ROMAJI_PREFIX, single));
  if (q.hepburn !== null) consider(prefix(q.hepburn, hepburn, 'hepburn', ROMAJI_PREFIX * HEPBURN_PENALTY, single));
  // 4. romaji 部分一致（訓令 → ヘボン。クエリ romaji 2文字以上）
  if (q.kunrei !== null) consider(substring(q.kunrei, kunrei, 'kunrei', ROMAJI_SUBSTRING, 2, single));
  if (q.hepburn !== null) consider(substring(q.hepburn, hepburn, 'hepburn', ROMAJI_SUBSTRING * HEPBURN_PENALTY, 2, single));

  if (best === null) return null;
  const c: Candidate = best;
  return { tier: 1, intraScore: c.intraScore, space: c.space, positions: range(c.len, c.offset) };
};
