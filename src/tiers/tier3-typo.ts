// tier 3: 誤字許容層（spec 4.3）。中間の置換・挿入・削除・転置を救う。
// OSA（restricted Damerau-Levenshtein）の prefix 距離 — データ末尾の余りは無料。
// 空間ごとに maxDist を計測。romaji 空間は有効方式から1つ（訓令優先）。
// positions は返さない（tier 3 は matches 非対象、spec 6章）。

import type { Matcher, Space } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';

const MIN_LEN = 2;

function maxDistFor(len: number): number {
  return Math.max(1, Math.ceil(len / 3));
}

/**
 * OSA prefix 距離。q を t の任意の prefix に合わせる最小編集距離（末尾余り無料）。
 * 行最小 > maxDist で早期打ち切り（maxDist+1 を返す）。
 */
function osaPrefixDistance(q: string, t: string, maxDist: number): number {
  const m = q.length;
  const n = t.length;
  if (m === 0) return 0;
  if (n + maxDist < m) return maxDist + 1; // 長さ差だけで超過

  // dp[i][j] = q[0..i) を t[0..j) に合わせる距離
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= n; j++) {
      const cost = q[i - 1] === t[j - 1] ? 0 : 1;
      let v = Math.min(
        dp[i - 1]![j]! + 1, // 削除
        dp[i]![j - 1]! + 1, // 挿入
        dp[i - 1]![j - 1]! + cost, // 置換/一致
      );
      if (
        i > 1 &&
        j > 1 &&
        q[i - 1] === t[j - 2] &&
        q[i - 2] === t[j - 1]
      ) {
        v = Math.min(v, dp[i - 2]![j - 2]! + 1); // 転置
      }
      dp[i]![j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1; // 早期打ち切り
  }

  // prefix 距離 = q を t の任意 prefix に合わせた最小（末尾余り無料）
  let best = dp[m]![0]!;
  for (let j = 1; j <= n; j++) if (dp[m]![j]! < best) best = dp[m]![j]!;
  return best;
}

interface Candidate {
  readonly intraScore: number;
  readonly space: Space;
}

export const tier3Typo: Matcher = (q: NormalizedQuery, e: IndexEntry) => {
  let best: Candidate | null = null;
  const consider = (query: string | null, data: string, space: Space): void => {
    if (query === null || query.length < MIN_LEN || data.length === 0) return;
    const maxDist = maxDistFor(query.length);
    const d = osaPrefixDistance(query, data, maxDist);
    if (d > maxDist) return;
    const intraScore = 1 - d / (maxDist + 1);
    if (best === null || intraScore > best.intraScore) best = { intraScore, space };
  };

  // かな空間
  consider(q.kana, e.kana.text, 'kana');
  // romaji 空間は有効方式から1つ（訓令優先、訓令無効なら ヘボン）
  if (e.kunrei && q.kunrei !== null) consider(q.kunrei, e.kunrei.text, 'kunrei');
  else if (e.hepburn && q.hepburn !== null) consider(q.hepburn, e.hepburn.text, 'hepburn');

  if (best === null) return null;
  const c: Candidate = best;
  return { tier: 3, intraScore: c.intraScore, space: c.space, positions: null };
};
