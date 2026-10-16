// tier 1: 完全マッチ層（spec 4.1）。クエリ文字列がデータに連続して現れる、または各単語の頭文字に並ぶ。
// 一致の位置で4段に分け（item の先頭 > 単語の頭 > 頭文字 > 単語の途中）、段の中は coverage × 係数。
// intraScore = (段 + 素点) / 4。サブマッチを固定順で評価し最大を採用（同点は先の評価）。
// 評価順（spec 5章タイブレーク）: かな（打鍵ラティスでは入力文字のまま → 打鍵経由）> 訓令 > ヘボン、
// 各空間で 先頭 > 単語の頭 > 頭文字 > 単語の途中。打鍵を経由した経路は romaji の係数・最小長を取る。

import type { Matcher, Space } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';
import type { MatchKind } from '../types.js';
import { contiguousAt, expandByDepth, latticeFeasible, type ContiguousMatch, type Lattice } from '../lattice.js';

export const KANA_PREFIX = 1.0;
export const KANA_SUBSTRING = 0.9;
export const ROMAJI_PREFIX = 0.97;
export const ROMAJI_SUBSTRING = 0.87;
export const HEPBURN_PENALTY = 0.99; // 訓令優先（両式同時マッチ時の決定性）

// 段（spec 4.1）。値が大きいほど上
export const PREFIX = 3; // item の先頭から
export const WORD = 2; // 単語の頭から
export const INITIALS = 1; // 各単語の頭文字（単語の中で続け、後ろの単語の頭へ飛ぶ）
export const INNER = 0; // 単語の途中
export const KIND_OF_CLASS: readonly MatchKind[] = ['inner', 'initials', 'word', 'prefix'];

/** 段と素点（coverage × 係数 ∈ (0, 1]）から intraScore を作る。完全一致は (3 + 1) / 4 = 1 */
export function grade(cls: number, raw: number): number {
  return (cls + raw) / 4;
}

// 連続一致は offset/len だけ持ち、最終 best 確定後に1回だけ配列化する。頭文字は positions を持つ
export interface Candidate {
  readonly intraScore: number;
  /** 段（PREFIX・WORD・INITIALS・INNER） */
  readonly cls: number;
  readonly space: Space;
  readonly offset: number;
  readonly len: number;
  readonly positions: number[] | null;
}

function contiguous(cls: number, raw: number, space: Space, offset: number, len: number): Candidate {
  return { intraScore: grade(cls, raw), cls, space, offset, len, positions: null };
}

function range(len: number, offset: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < len; i++) p.push(offset + i);
  return p;
}

function prefix(query: string, data: string, space: Space, factor: number): Candidate | null {
  if (query.length === 0 || data.length === 0) return null;
  if (!data.startsWith(query)) return null;
  return contiguous(PREFIX, (query.length / data.length) * factor, space, 0, query.length);
}

/** 先頭以外の連続一致。単語の頭から始まる出現があればそれ（単語の頭の段）、無ければ最初の出現（単語の途中の段） */
function substring(
  query: string,
  data: string,
  heads: ReadonlySet<number>,
  space: Space,
  factor: number,
  minLen: number,
): Candidate | null {
  if (query.length < minLen || data.length === 0) return null;
  const first = data.indexOf(query, 1);
  if (first < 0) return null;
  const raw = (query.length / data.length) * factor;
  for (let i = first; i >= 0; i = data.indexOf(query, i + 1)) {
    if (heads.has(i)) return contiguous(WORD, raw, space, i, query.length);
  }
  return contiguous(INNER, raw, space, first, query.length);
}

// 頭文字の一致の作業領域（呼び出しごとの確保を避けて使い回す）
let iniOk = new Uint8Array(0);
let iniSuf = new Uint8Array(0);

/**
 * 頭文字の一致: クエリの各文字を、単語の頭から始め、直前の続き（+1）か後ろの単語の頭に置けるか。
 * = クエリを、単語の頭から始まる連続一致の断片に分け、断片の頭が右へ進むように並べられるか。
 * 単語の頭（heads、昇順）の上だけで解くため、計算量はデータ長によらない。
 * 置き方は先頭寄り・続き優先（各断片を並べ切れる範囲で最長、次の断片は最も前の単語の頭）。
 * 単語の頭が先頭だけのデータは前方一致と同じため扱わない。
 */
export function initials(
  query: string,
  data: string,
  heads: readonly number[],
  space: Space,
  factor: number,
): Candidate | null {
  const m = query.length;
  const n = data.length;
  const H = heads.length;
  if (m < 2 || n === 0 || H < 2) return null;
  const c0 = query.charCodeAt(0);
  let start = false;
  for (let k = 0; k < H && !start; k++) start = data.charCodeAt(heads[k]!) === c0;
  if (!start) return null;
  // ok[i*H + k]: query[i..] を、heads[k] から始まる断片から並べ切れる。
  // suf[i*(H+1) + k]: k 以降のいずれかで ok（右端 k = H は 0）
  if (iniOk.length < m * H) iniOk = new Uint8Array(m * H);
  if (iniSuf.length < (m + 1) * (H + 1)) iniSuf = new Uint8Array((m + 1) * (H + 1));
  const ok = iniOk;
  const suf = iniSuf;
  const lcp = (i: number, k: number): number => {
    const h = heads[k]!;
    let l = 0;
    while (i + l < m && h + l < n && query.charCodeAt(i + l) === data.charCodeAt(h + l)) l++;
    return l;
  };
  // 断片 heads[k] .. heads[k]+len-1 の次に置ける最初の単語の頭の添字
  const nextHead = (k: number, len: number): number => {
    const end = heads[k]! + len;
    let j = k + 1;
    while (j < H && heads[j]! < end) j++;
    return j;
  };
  for (let i = m - 1; i >= 0; i--) {
    for (let k = 0; k < H; k++) {
      const L = lcp(i, k);
      let v = 0;
      for (let len = 1; len <= L && !v; len++) {
        if (i + len === m || suf[(i + len) * (H + 1) + nextHead(k, len)]) v = 1;
      }
      ok[i * H + k] = v;
    }
    suf[i * (H + 1) + H] = 0;
    for (let k = H - 1; k >= 0; k--) suf[i * (H + 1) + k] = ok[i * H + k]! | suf[i * (H + 1) + k + 1]!;
  }
  if (!suf[0]) return null;
  const positions: number[] = [];
  let k = 0;
  while (!ok[k]) k++;
  for (let i = 0; i < m; ) {
    // 並べ切れる範囲で最長の断片
    let len = lcp(i, k);
    while (!(i + len === m || suf[(i + len) * (H + 1) + nextHead(k, len)])) len--;
    for (let t = 0; t < len; t++) positions.push(heads[k]! + t);
    i += len;
    if (i < m) {
      k = nextHead(k, len);
      while (!ok[i * H + k]) k++;
    }
  }
  return { intraScore: grade(INITIALS, (m / n) * factor), cls: INITIALS, space, offset: 0, len: 0, positions };
}

const scratchMatch: ContiguousMatch = { plain: 0, ks: 0 };

// [打鍵経由か][段] → 最長の長さと位置（呼び出しごとの確保を避けて使い回す）
const segLen = [new Int32Array(4), new Int32Array(4)];
const segAt = [new Int32Array(4), new Int32Array(4)];
function takeSeg(f: number, cls: number, l: number, s: number): void {
  if (l > segLen[f]![cls]!) {
    segLen[f]![cls] = l;
    segAt[f]![cls] = s;
  }
}

/**
 * ラティスの連続一致・頭文字の候補を評価順（入力文字のまま → 打鍵経由、各々 先頭 > 単語の頭 > 頭文字 > 途中）で渡す。
 * 長さは一致した経路の長さ。同じ段では最長、同長は最も前の位置。
 * 頭文字は、既にある候補を上回り得るとき（上限 = 最長の経路で素点を取ったとき）だけ求める。
 */
function latticeCandidates(lat: Lattice, data: string, heads: ReadonlySet<number>, headList: readonly number[]): void {
  const N = data.length;
  if (N === 0) return;
  for (let f = 0; f < 2; f++) {
    segLen[f]!.fill(0);
    segAt[f]!.fill(0);
  }
  if (lat.paths !== null) {
    // 経路ごとに出現位置を調べる（各段で最長、同じ長さは最も前の位置。状態遷移で辿るのと同じ結果）
    for (const [p, ks] of lat.paths) {
      const f = ks ? 1 : 0;
      for (let s = data.indexOf(p); s >= 0; s = data.indexOf(p, s + 1)) {
        const cls = s === 0 ? PREFIX : heads.has(s) ? WORD : INNER;
        if (f === 1 && cls !== PREFIX && p.length < 2) continue; // 打鍵の部分一致は2文字以上
        if (p.length > segLen[f]![cls]! || (p.length === segLen[f]![cls]! && s < segAt[f]![cls]!)) {
          segLen[f]![cls] = p.length;
          segAt[f]![cls] = s;
        }
      }
    }
  } else {
    for (let s = 0; s < N; s++) {
      if (!lat.firstCodes.has(data.charCodeAt(s))) continue;
      contiguousAt(lat, data, s, scratchMatch);
      const cls = s === 0 ? PREFIX : heads.has(s) ? WORD : INNER;
      takeSeg(0, cls, scratchMatch.plain, s);
      if (cls === PREFIX || scratchMatch.ks >= 2) takeSeg(1, cls, scratchMatch.ks, s); // 打鍵の部分一致は2文字以上
    }
  }
  const prefixFactor = [KANA_PREFIX, ROMAJI_PREFIX];
  const substringFactor = [KANA_SUBSTRING, ROMAJI_SUBSTRING];
  for (let f = 0; f < 2; f++) {
    const l = segLen[f]![PREFIX]!;
    if (l > 0) consider(contiguous(PREFIX, (l / N) * prefixFactor[f]!, 'kana', 0, l));
  }
  for (let f = 0; f < 2; f++) {
    const l = segLen[f]![WORD]!;
    if (l > 0) consider(contiguous(WORD, (l / N) * substringFactor[f]!, 'kana', segAt[f]![WORD]!, l));
  }
  if (headList.length >= 2) {
    const ex = expandByDepth(lat);
    const longest = ex.finals[ex.finals.length - 1]![1];
    if (longest >= 2 && (best === null || best.intraScore < grade(INITIALS, (longest / N) * KANA_SUBSTRING))) {
      const ini = latticeInitials(lat, data, headList);
      for (let f = 0; f < 2; f++) {
        const hit = ini[f];
        if (hit) {
          const intraScore = grade(INITIALS, (hit.length / N) * substringFactor[f]!);
          consider({ intraScore, cls: INITIALS, space: 'kana', offset: 0, len: 0, positions: hit });
        }
      }
    }
  }
  for (let f = 0; f < 2; f++) {
    const l = segLen[f]![INNER]!;
    if (l > 0) consider(contiguous(INNER, (l / N) * substringFactor[f]!, 'kana', segAt[f]![INNER]!, l));
  }
}

// latticeInitials の作業領域（状態 = 展開状態 * 2 + 打鍵経由フラグ）
let iniAvail = new Int32Array(0); // その状態から次の断片を始められる最小の位置（断片の終わり + 1）
let iniRecHead = new Int32Array(0); // iniAvail を決めた断片の頭の位置
let iniRecFrom = new Int32Array(0); // その断片を始めた状態（-1 = 始点）
let iniCur = new Int32Array(0);
let iniCurOrigin = new Int32Array(0);
let iniNext = new Int32Array(0);
let iniNextOrigin = new Int32Array(0);
let iniStamp = new Int32Array(0);
let iniGen = 0;

/**
 * 頭文字の一致のラティス版。単語の頭を左から順に、その位置で断片を始められる状態から連続一致を辿り、
 * 断片の終わりで「次の断片を始められる最小の位置」を状態ごとに記録する（最小で足りる: 早く終わるほど後ろの
 * 単語の頭を多く使える）。フラグごとに最長の経路（経路長 2 以上）の位置列を返す。
 */
function latticeInitials(lat: Lattice, data: string, heads: readonly number[]): [number[] | null, number[] | null] {
  const out: [number[] | null, number[] | null] = [null, null];
  const n = data.length;
  let start = false;
  for (let k = 0; k < heads.length && !start; k++) start = lat.firstCodes.has(data.charCodeAt(heads[k]!));
  if (!start) return out;
  const ex = expandByDepth(lat);
  const { outStart, outTo, outCh, outKs } = ex;
  const S = ex.X * 2;
  if (iniAvail.length < S) {
    iniAvail = new Int32Array(S);
    iniRecHead = new Int32Array(S);
    iniRecFrom = new Int32Array(S);
    iniCur = new Int32Array(S);
    iniCurOrigin = new Int32Array(S);
    iniNext = new Int32Array(S);
    iniNextOrigin = new Int32Array(S);
    iniStamp = new Int32Array(S);
    iniGen = 0;
  }
  const INF = 1 << 30;
  iniAvail.fill(INF, 0, S);
  iniAvail[0] = 0; // 始点（展開状態 0・フラグ 0）はどの単語の頭からでも始められる
  iniRecFrom[0] = -1;
  for (const h of heads) {
    // この単語の頭で断片を始められる状態（iniAvail ≤ h）
    let curLen = 0;
    for (let st = 0; st < S; st++) {
      if (iniAvail[st]! <= h) {
        iniCur[curLen] = st;
        iniCurOrigin[curLen++] = st;
      }
    }
    for (let p = h; p < n && curLen > 0; p++) {
      const c = data.charCodeAt(p);
      iniGen++;
      let nextLen = 0;
      for (let a = 0; a < curLen; a++) {
        const st = iniCur[a]!;
        const x = st >> 1;
        const f = st & 1;
        for (let k = outStart[x]!; k < outStart[x + 1]!; k++) {
          if (outCh[k] !== c) continue;
          const ns = outTo[k]! * 2 + (f | outKs[k]!);
          if (iniStamp[ns] === iniGen) continue;
          iniStamp[ns] = iniGen;
          iniNext[nextLen] = ns;
          iniNextOrigin[nextLen++] = iniCurOrigin[a]!;
          if (p + 1 < iniAvail[ns]!) {
            iniAvail[ns] = p + 1;
            iniRecHead[ns] = h;
            iniRecFrom[ns] = iniCurOrigin[a]!;
          }
        }
      }
      const tc = iniCur;
      iniCur = iniNext;
      iniNext = tc;
      const to = iniCurOrigin;
      iniCurOrigin = iniNextOrigin;
      iniNextOrigin = to;
      curLen = nextLen;
    }
  }
  for (let f = 0; f < 2; f++) {
    for (let i = ex.finals.length - 1; i >= 0 && out[f] === null; i--) {
      const [xf, m] = ex.finals[i]!;
      const st = xf * 2 + f;
      if (m < 2 || iniAvail[st]! >= INF) continue;
      // 断片を後ろからたどって位置列を復元する
      const positions: number[] = [];
      for (let t = st; t > 0 && iniRecFrom[t] !== -1; t = iniRecFrom[t]!) {
        const h = iniRecHead[t]!;
        for (let q = iniAvail[t]! - 1; q >= h; q--) positions.push(q);
        if (iniRecFrom[t] === 0) break;
      }
      out[f] = positions.reverse();
    }
  }
  return out;
}

// 照合中の最良候補（1 回の tier1Exact 呼び出し内で使う。JS は単一スレッド・同期実行のため安全）。
// strict > により、同点では先に評価した（＝優先順が上の）候補が残る
let best: Candidate | null = null;
function consider(c: Candidate | null): void {
  if (c !== null && (best === null || c.intraScore > best.intraScore)) best = c;
}

/** 文字列クエリ1空間分のサブマッチ（単語の頭が先頭だけなら頭文字は前方一致と同じため省く） */
function considerSpace(
  query: string,
  data: string,
  heads: ReadonlySet<number>,
  headList: readonly number[],
  space: Space,
  prefixFactor: number,
  substringFactor: number,
  minLen: number,
  qMask: number,
  dMask: number,
): void {
  // どのサブマッチもクエリの全文字がデータにあることが前提（charMask の衝突は安全側）
  if ((qMask & ~dMask) !== 0) return;
  consider(prefix(query, data, space, prefixFactor));
  consider(substring(query, data, heads, space, substringFactor, minLen));
  // 頭文字の素点は query.length / data.length 固定。既にある候補を上回れないなら求めない
  if (headList.length >= 2 && (best === null || best.intraScore < grade(INITIALS, (query.length / data.length) * substringFactor))) {
    consider(initials(query, data, headList, space, substringFactor));
  }
}

export const tier1Exact: Matcher = (q: NormalizedQuery, e: IndexEntry) => {
  best = null;
  const kana = e.kana.text;
  if (q.lattice !== null && e.hasKeystrokeChar) {
    // データに打鍵の文字が無ければ打鍵経路は一致し得ないため文字列照合（else）と同値
    if (latticeFeasible(q.lattice, e.kanaMask)) latticeCandidates(q.lattice, kana, e.kanaBoundaries, e.kanaHeadList);
  } else if (!q.shadowed) {
    considerSpace(q.kana, kana, e.kanaBoundaries, e.kanaHeadList, 'kana', KANA_PREFIX, KANA_SUBSTRING, 1, q.kanaMask, e.kanaMask);
  }
  if (q.kunrei !== null && e.kunrei !== null) {
    considerSpace(q.kunrei, e.kunrei.text, e.kunreiHeads, e.kunreiHeadList, 'kunrei', ROMAJI_PREFIX, ROMAJI_SUBSTRING, 2, q.kunreiMask, e.kunreiMask);
  }
  if (q.hepburn !== null && e.hepburn !== null) {
    const f = HEPBURN_PENALTY;
    considerSpace(q.hepburn, e.hepburn.text, e.hepburnHeads, e.hepburnHeadList, 'hepburn', ROMAJI_PREFIX * f, ROMAJI_SUBSTRING * f, 2, q.hepburnMask, e.hepburnMask);
  }

  // 長音の印つきローマ字（spec 2.2）。係数・最小長は訓令と同じ
  if (q.long !== null && e.long !== null) {
    considerSpace(q.long, e.long.text, e.longHeads, e.longHeadList, 'long', ROMAJI_PREFIX, ROMAJI_SUBSTRING, 2, q.longMask, e.longMask);
  }

  if (best === null) return null;
  const c: Candidate = best;
  best = null;
  return {
    tier: 1,
    kind: KIND_OF_CLASS[c.cls]!,
    intraScore: c.intraScore,
    space: c.space,
    positions: c.positions ?? range(c.len, c.offset),
  };
};
