// tier 3: 誤字許容層（spec 4.3）。中間の置換・挿入・削除・転置を救う。
// OSA（restricted Damerau-Levenshtein）の prefix 距離 — データ末尾の余りは無料。
// 空間ごとに maxDist を計測。romaji 空間は有効方式から1つ（訓令優先）。
// positions は返さない（tier 3 は matches 非対象、spec 6章）。

import type { Matcher, Space } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';
import { popcount } from '../charmask.js';
import { expandByDepth, type Lattice } from '../lattice.js';

const MIN_LEN = 2;

function maxDistFor(len: number): number {
  return Math.max(1, Math.ceil(len / 3));
}

// モジュールレベルのスクラッチ（フラット 2D）。エントリごとの確保を廃し GC 圧を消す。
// JS は単一スレッド・同期実行のため再利用は安全。
let osaBuf = new Int32Array(0);
function osaScratch(size: number): Int32Array {
  if (osaBuf.length < size) osaBuf = new Int32Array(size);
  return osaBuf;
}

/**
 * OSA prefix 距離。q を t の任意の prefix に合わせる最小編集距離（末尾余り無料）。
 * 行最小 > maxDist で早期打ち切り。最終 j 走査は [m-maxDist, m+maxDist] の窓のみ
 * （窓外は |i-j| 由来で必ず maxDist 超過）。dp はフラット Int32 スクラッチを再利用。
 */
function osaPrefixDistance(q: string, t: string, maxDist: number): number {
  const m = q.length;
  const n = t.length;
  if (m === 0) return 0;
  if (n + maxDist < m) return maxDist + 1; // 長さ差だけで超過

  const cols = n + 1;
  const dp = osaScratch((m + 1) * cols);
  for (let j = 0; j <= n; j++) dp[j] = j; // 行0

  for (let i = 1; i <= m; i++) {
    const row = i * cols;
    const prow = (i - 1) * cols;
    const pprow = (i - 2) * cols;
    dp[row] = i; // 列0
    const qi = q[i - 1]!;
    const qim1 = i > 1 ? q[i - 2]! : '';
    let rowMin = Infinity;
    for (let j = 1; j <= n; j++) {
      const cost = qi === t[j - 1] ? 0 : 1;
      let v = Math.min(
        dp[prow + j]! + 1, // 削除
        dp[row + j - 1]! + 1, // 挿入
        dp[prow + j - 1]! + cost, // 置換/一致
      );
      if (i > 1 && j > 1 && qi === t[j - 2] && qim1 === t[j - 1]) {
        v = Math.min(v, dp[pprow + j - 2]! + 1); // 転置
      }
      dp[row + j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1; // 早期打ち切り
  }

  // prefix 距離 = q を t の任意 prefix に合わせた最小。窓外は maxDist 超過のため走査不要
  const mrow = m * cols;
  const lo = Math.max(0, m - maxDist);
  const hi = Math.min(n, m + maxDist);
  let best = dp[mrow + lo]!;
  for (let j = lo + 1; j <= hi; j++) if (dp[mrow + j]! < best) best = dp[mrow + j]!;
  return best;
}

interface Candidate {
  readonly intraScore: number;
  readonly space: Space;
}

let latOsaBuf = new Int32Array(0);
let absentBuf = new Int32Array(0);

/**
 * OSA prefix 距離のラティス版。経路長 m ごとに距離を求め、maxDist(m) 以内で
 * intraScore 最大のものを返す。非マッチは null。
 * 前置フィルタ: データに無い文字の出現数は編集数の下限（経路長ごとの最小値で判定）。
 */
function latticeOsaScore(lat: Lattice, t: string, dMask: number): number | null {
  const n = t.length;
  if (n === 0) return null;
  const ex = expandByDepth(lat);
  const { X, inStart, inFrom, inCh, inBit } = ex;
  if (absentBuf.length < X) absentBuf = new Int32Array(X);
  const absent = absentBuf;
  absent[0] = 0;
  for (let x = 1; x < X; x++) {
    let a = 1 << 30;
    for (let k = inStart[x]!; k < inStart[x + 1]!; k++) {
      const v = absent[inFrom[k]!]! + ((inBit[k]! & dMask) === 0 ? 1 : 0);
      if (v < a) a = v;
    }
    absent[x] = a;
  }
  // 判定対象の経路長の maxDist 最大値。dp[x][j] ≥ |j − 経路長(x)| のため帯の外は必ずこれを超える
  let band = -1;
  for (const [x, m] of ex.finals) {
    if (m >= MIN_LEN && n + maxDistFor(m) >= m && absent[x]! <= maxDistFor(m)) band = Math.max(band, maxDistFor(m));
  }
  if (band < 0) return null;

  // 状態順 × 帯内の列で解く（依存は前状態か同状態の左列のみ）。帯の外は INF 扱い
  const INF = 1 << 29;
  const cols = n + 1;
  if (latOsaBuf.length < X * cols) latOsaBuf = new Int32Array(X * cols);
  const dp = latOsaBuf;
  const depth = ex.depth;
  const at = (x: number, j: number): number => {
    const dx = j - depth[x]!;
    return j < 0 || dx > band || dx < -band ? INF : dp[x * cols + j]!;
  };
  for (let j = 0; j <= Math.min(n, band); j++) dp[j] = j;
  for (let x = 1; x < X; x++) {
    const dx = depth[x]!;
    const lo = Math.max(0, dx - band);
    const hi = Math.min(n, dx + band);
    const row = x * cols;
    for (let j = lo; j <= hi; j++) {
      if (j === 0) {
        dp[row] = dx; // クエリ側を全削除
        continue;
      }
      const tj = t.charCodeAt(j - 1);
      const tj2 = j > 1 ? t.charCodeAt(j - 2) : -1;
      let v = (j - 1 >= lo ? dp[row + j - 1]! : INF) + 1; // 挿入
      for (let k = inStart[x]!; k < inStart[x + 1]!; k++) {
        const y = inFrom[k]!;
        const c = inCh[k]!;
        const del = at(y, j) + 1;
        const sub = at(y, j - 1) + (c === tj ? 0 : 1);
        if (del < v) v = del;
        if (sub < v) v = sub;
        if (c === tj2) {
          for (let k2 = inStart[y]!; k2 < inStart[y + 1]!; k2++) {
            if (inCh[k2] === tj) {
              const tr = at(inFrom[k2]!, j - 2) + 1; // 転置
              if (tr < v) v = tr;
            }
          }
        }
      }
      dp[row + j] = v;
    }
  }
  let best: number | null = null;
  for (const [x, m] of ex.finals) {
    if (m < MIN_LEN) continue;
    const maxDist = maxDistFor(m);
    if (n + maxDist < m || absent[x]! > maxDist) continue;
    let d = INF;
    for (let j = Math.max(0, m - band); j <= Math.min(n, m + band); j++) {
      const v = dp[x * cols + j]!;
      if (v < d) d = v;
    }
    if (d > maxDist) continue;
    const s = 1 - d / (maxDist + 1);
    if (best === null || s > best) best = s;
  }
  return best;
}

export const tier3Typo: Matcher = (q: NormalizedQuery, e: IndexEntry) => {
  let best: Candidate | null = null;
  const consider = (query: string | null, qMask: number, data: string, dMask: number, space: Space): void => {
    if (query === null || query.length < MIN_LEN || data.length === 0) return;
    const maxDist = maxDistFor(query.length);
    // 前置フィルタ: データに無いクエリ文字1つにつき編集≥1。衝突は count を過小評価し安全側
    if (popcount(qMask & ~dMask) > maxDist) return;
    const d = osaPrefixDistance(query, data, maxDist);
    if (d > maxDist) return;
    const intraScore = 1 - d / (maxDist + 1);
    if (best === null || intraScore > best.intraScore) best = { intraScore, space };
  };

  // かな空間
  if (q.lattice !== null && e.hasKeystrokeChar) {
    const s = latticeOsaScore(q.lattice, e.kana.text, e.kanaMask);
    if (s !== null) best = { intraScore: s, space: 'kana' };
  } else if (!q.shadowed) {
    consider(q.kana, q.kanaMask, e.kana.text, e.kanaMask, 'kana');
  }
  // romaji 空間は有効方式から1つ（訓令優先、訓令無効なら ヘボン）
  if (e.kunrei && q.kunrei !== null) consider(q.kunrei, q.kunreiMask, e.kunrei.text, e.kunreiMask, 'kunrei');
  else if (e.hepburn && q.hepburn !== null) consider(q.hepburn, q.hepburnMask, e.hepburn.text, e.hepburnMask, 'hepburn');

  if (best === null) return null;
  const c: Candidate = best;
  return { tier: 3, intraScore: c.intraScore, space: c.space, positions: null };
};
