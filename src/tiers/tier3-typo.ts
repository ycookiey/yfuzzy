// tier 3: 誤字許容層（spec 4.3）。中間の置換・挿入・削除・転置を救う。
// OSA（restricted Damerau-Levenshtein）の prefix 距離 — データ末尾の余りは無料。
// 空間ごとに maxDist を計測。romaji 空間は有効方式から1つ（訓令優先）。
// positions は返さない（tier 3 は matches 非対象、spec 6章）。

import type { Matcher, Space } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';
import { popcount } from '../charmask.js';

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
  consider(q.kana, q.kanaMask, e.kana.text, e.kanaMask, 'kana');
  // romaji 空間は有効方式から1つ（訓令優先、訓令無効なら ヘボン）
  if (e.kunrei && q.kunrei !== null) consider(q.kunrei, q.kunreiMask, e.kunrei.text, e.kunreiMask, 'kunrei');
  else if (e.hepburn && q.hepburn !== null) consider(q.hepburn, q.hepburnMask, e.hepburn.text, e.hepburnMask, 'hepburn');

  if (best === null) return null;
  const c: Candidate = best;
  return { tier: 3, intraScore: c.intraScore, space: c.space, positions: null };
};
