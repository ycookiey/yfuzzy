// tier 1: 完全マッチ層（spec 4.1）。クエリ文字列がデータに連続して現れる、または各単語の頭文字に並ぶ。
// 一致の位置で4段に分け（item の先頭 > 単語の頭 > 頭文字 > 単語の途中）、段の中は coverage × 係数。
// intraScore = (段 + 素点) / 4。サブマッチを固定順で評価し最大を採用（同点は先の評価）。
// 評価順（spec 5章タイブレーク）: かな（打鍵ラティスでは入力文字のまま → 打鍵経由）> 訓令 > ヘボン、
// 各空間で 先頭 > 単語の頭 > 頭文字 > 単語の途中。打鍵を経由した経路は romaji の係数・最小長を取る。

import type { Matcher, Space } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';
import { contiguousAt, expandByDepth, latticeFeasible, type ContiguousMatch, type Lattice } from '../lattice.js';

const KANA_PREFIX = 1.0;
const KANA_SUBSTRING = 0.9;
const ROMAJI_PREFIX = 0.97;
const ROMAJI_SUBSTRING = 0.87;
const HEPBURN_PENALTY = 0.99; // 訓令優先（両式同時マッチ時の決定性）

// 段（spec 4.1）。値が大きいほど上
const PREFIX = 3; // item の先頭から
const WORD = 2; // 単語の頭から
const INITIALS = 1; // 各単語の頭文字（単語の中で続け、後ろの単語の頭へ飛ぶ）
const INNER = 0; // 単語の途中

/** 段と素点（coverage × 係数 ∈ (0, 1]）から intraScore を作る。完全一致は (3 + 1) / 4 = 1 */
function grade(cls: number, raw: number): number {
  return (cls + raw) / 4;
}

// 連続一致は offset/len だけ持ち、最終 best 確定後に1回だけ配列化する。頭文字は positions を持つ
interface Candidate {
  readonly intraScore: number;
  readonly space: Space;
  readonly offset: number;
  readonly len: number;
  readonly positions: number[] | null;
}

function contiguous(cls: number, raw: number, space: Space, offset: number, len: number): Candidate {
  return { intraScore: grade(cls, raw), space, offset, len, positions: null };
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

/**
 * 頭文字の一致: クエリの各文字を、単語の頭から始め、直前の続き（+1）か後ろの単語の頭に置けるか。
 * 置き方は先頭寄り・続き優先で決める。単語の頭が先頭だけのデータは前方一致と同じため扱わない。
 */
function initials(
  query: string,
  data: string,
  heads: ReadonlySet<number>,
  space: Space,
  factor: number,
): Candidate | null {
  const m = query.length;
  const n = data.length;
  if (m < 2 || n === 0 || heads.size < 2) return null;
  // ok[i*n + p]: query[i] を p に置いて query[i..] を並べ切れる
  const ok = new Uint8Array(m * n);
  for (let i = m - 1; i >= 0; i--) {
    let headAfter = false; // p より後ろに query[i+1] を置ける単語の頭がある
    for (let p = n - 1; p >= 0; p--) {
      if (data[p] === query[i]) {
        ok[i * n + p] = i === m - 1 || (p + 1 < n && ok[(i + 1) * n + p + 1] === 1) || headAfter ? 1 : 0;
      }
      if (i < m - 1 && heads.has(p) && ok[(i + 1) * n + p]) headAfter = true;
    }
  }
  let p = -1;
  for (let s = 0; s < n; s++) {
    if (heads.has(s) && ok[s]) {
      p = s;
      break;
    }
  }
  if (p < 0) return null;
  const positions = [p];
  for (let i = 1; i < m; i++) {
    if (p + 1 < n && ok[i * n + p + 1]) p = p + 1;
    else {
      let q = p + 1;
      while (!(heads.has(q) && ok[i * n + q])) q++;
      p = q;
    }
    positions.push(p);
  }
  return { intraScore: grade(INITIALS, (m / n) * factor), space, offset: 0, len: 0, positions };
}

const scratchMatch: ContiguousMatch = { plain: 0, ks: 0 };

/**
 * ラティスの連続一致・頭文字の候補を評価順（入力文字のまま → 打鍵経由、各々 先頭 > 単語の頭 > 頭文字 > 途中）で渡す。
 * 長さは一致した経路の長さ。同じ段では最長、同長は最も前の位置。
 */
function latticeCandidates(
  lat: Lattice,
  data: string,
  heads: ReadonlySet<number>,
  consider: (c: Candidate | null) => void,
): void {
  const N = data.length;
  if (N === 0) return;
  // [打鍵経由か][段] → 最長の長さと位置
  const len = [new Int32Array(4), new Int32Array(4)];
  const at = [new Int32Array(4), new Int32Array(4)];
  const take = (f: number, cls: number, l: number, s: number): void => {
    if (l > len[f]![cls]!) {
      len[f]![cls] = l;
      at[f]![cls] = s;
    }
  };
  for (let s = 0; s < N; s++) {
    if (!lat.firstChars.has(data[s]!)) continue;
    contiguousAt(lat, data, s, scratchMatch);
    const cls = s === 0 ? PREFIX : heads.has(s) ? WORD : INNER;
    take(0, cls, scratchMatch.plain, s);
    if (cls === PREFIX || scratchMatch.ks >= 2) take(1, cls, scratchMatch.ks, s); // 打鍵の部分一致は2文字以上
  }
  const ini = heads.size >= 2 ? latticeInitials(lat, data, heads) : null;
  const factors = [
    [KANA_PREFIX, KANA_SUBSTRING],
    [ROMAJI_PREFIX, ROMAJI_SUBSTRING],
  ] as const;
  for (let f = 0; f < 2; f++) {
    const [pf, sf] = factors[f]!;
    if (len[f]![PREFIX]! > 0) consider(contiguous(PREFIX, (len[f]![PREFIX]! / N) * pf, 'kana', 0, len[f]![PREFIX]!));
    if (len[f]![WORD]! > 0) consider(contiguous(WORD, (len[f]![WORD]! / N) * sf, 'kana', at[f]![WORD]!, len[f]![WORD]!));
    const hit = ini?.[f];
    if (hit) consider({ intraScore: grade(INITIALS, (hit.length / N) * sf), space: 'kana', offset: 0, len: 0, positions: hit });
    if (len[f]![INNER]! > 0) consider(contiguous(INNER, (len[f]![INNER]! / N) * sf, 'kana', at[f]![INNER]!, len[f]![INNER]!));
  }
}

/**
 * 頭文字の一致のラティス版。展開状態 × 打鍵経由フラグ × 置いた位置で到達を解き、
 * フラグごとに最長の経路（経路長 2 以上）の位置列を返す。
 */
function latticeInitials(lat: Lattice, data: string, heads: ReadonlySet<number>): [number[] | null, number[] | null] {
  const ex = expandByDepth(lat);
  const { X, inStart, inFrom, inCh, inKs } = ex;
  const n = data.length;
  // reach[(x*2+f)*n + p]: 状態 x・フラグ f の経路の最後の文字を p に置ける
  const reach = new Uint8Array(X * 2 * n);
  const minPos = new Int32Array(X * 2).fill(n); // reach が立つ最小の p
  for (let x = 1; x < X; x++) {
    for (let k = inStart[x]!; k < inStart[x + 1]!; k++) {
      const y = inFrom[k]!;
      const c = inCh[k]!;
      const ks = inKs[k]!;
      for (let fy = 0; fy < 2; fy++) {
        if (y !== 0 && minPos[y * 2 + fy]! >= n) continue;
        if (y === 0 && fy === 1) continue;
        const f = fy | ks;
        const base = (x * 2 + f) * n;
        const ybase = (y * 2 + fy) * n;
        for (let p = 0; p < n; p++) {
          if (data.charCodeAt(p) !== c || reach[base + p]) continue;
          const can =
            y === 0 ? heads.has(p) : (p > 0 && reach[ybase + p - 1] === 1) || (heads.has(p) && minPos[y * 2 + fy]! < p);
          if (can) {
            reach[base + p] = 1;
            if (p < minPos[x * 2 + f]!) minPos[x * 2 + f] = p;
          }
        }
      }
    }
  }
  const out: [number[] | null, number[] | null] = [null, null];
  for (let f = 0; f < 2; f++) {
    for (let i = ex.finals.length - 1; i >= 0 && out[f] === null; i--) {
      const [xf, m] = ex.finals[i]!;
      if (m < 2 || minPos[xf * 2 + f]! >= n) continue;
      out[f] = traceInitials(ex, reach, data, heads, xf, f, minPos[xf * 2 + f]!);
    }
  }
  return out;
}

/** latticeInitials の到達表から位置列を後ろ向きに復元する（続き優先） */
function traceInitials(
  ex: ReturnType<typeof expandByDepth>,
  reach: Uint8Array,
  data: string,
  heads: ReadonlySet<number>,
  x0: number,
  f0: number,
  p0: number,
): number[] {
  const { inStart, inFrom, inCh, inKs } = ex;
  const n = data.length;
  const positions = [p0];
  let x = x0;
  let f = f0;
  let p = p0;
  while (x !== 0) {
    let next: [number, number, number] | null = null;
    for (let k = inStart[x]!; k < inStart[x + 1]! && next === null; k++) {
      if (inCh[k] !== data.charCodeAt(p)) continue;
      const y = inFrom[k]!;
      if (y === 0) {
        if (inKs[k] === f && heads.has(p)) next = [0, 0, -1];
        continue;
      }
      for (let fy = 0; fy < 2 && next === null; fy++) {
        if ((fy | inKs[k]!) !== f) continue;
        const ybase = (y * 2 + fy) * n;
        if (p > 0 && reach[ybase + p - 1]) next = [y, fy, p - 1];
        else if (heads.has(p)) {
          for (let q = p - 1; q >= 0; q--) {
            if (reach[ybase + q]) {
              next = [y, fy, q];
              break;
            }
          }
        }
      }
    }
    if (next === null || next[0] === 0) break;
    [x, f, p] = next;
    positions.push(p);
  }
  return positions.reverse();
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
  space: Space,
  prefixFactor: number,
  substringFactor: number,
  minLen: number,
): void {
  consider(prefix(query, data, space, prefixFactor));
  consider(substring(query, data, heads, space, substringFactor, minLen));
  if (heads.size >= 2) consider(initials(query, data, heads, space, substringFactor));
}

export const tier1Exact: Matcher = (q: NormalizedQuery, e: IndexEntry) => {
  best = null;
  const kana = e.kana.text;
  if (q.lattice !== null && e.hasKeystrokeChar) {
    // データに打鍵の文字が無ければ打鍵経路は一致し得ないため文字列照合（else）と同値
    if (latticeFeasible(q.lattice, e.kanaMask)) latticeCandidates(q.lattice, kana, e.kanaBoundaries, consider);
  } else if (!q.shadowed) {
    considerSpace(q.kana, kana, e.kanaBoundaries, 'kana', KANA_PREFIX, KANA_SUBSTRING, 1);
  }
  if (q.kunrei !== null && e.kunrei !== null) {
    considerSpace(q.kunrei, e.kunrei.text, e.kunreiHeads, 'kunrei', ROMAJI_PREFIX, ROMAJI_SUBSTRING, 2);
  }
  if (q.hepburn !== null && e.hepburn !== null) {
    const f = HEPBURN_PENALTY;
    considerSpace(q.hepburn, e.hepburn.text, e.hepburnHeads, 'hepburn', ROMAJI_PREFIX * f, ROMAJI_SUBSTRING * f, 2);
  }

  if (best === null) return null;
  const c: Candidate = best;
  best = null;
  return { tier: 1, intraScore: c.intraScore, space: c.space, positions: c.positions ?? range(c.len, c.offset) };
};
