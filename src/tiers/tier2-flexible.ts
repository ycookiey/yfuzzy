// tier 2: 柔軟マッチ層（spec 4.2）。クエリがデータの subsequence（順序保存・飛び石）。
// 旧 subsequence + acronym + vowel-stripped の統合。
// 線形存在チェック → 位置選択 DP（境界/連続を優先）→ rate ベース intraScore。

import type { Matcher, Space } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';

// DP 定数（spec 4.2、【調整対象】）
const MATCH = 16;
const GAP_START = -3;
const GAP_EXTEND = -1;
const BOUNDARY = 8;
const CONSECUTIVE = 4;
const FIRST_CHAR = 2;

// intraScore 重み（spec 4.2、【調整対象】）
const W_BOUNDARY = 0.55;
const W_CONTINUITY = 0.3;
const W_START = 0.15;

const MIN_LEN = 2;
const NEG = -1e9; // -Infinity 相当のセンチネル（Int32 スクラッチ用。実スコアは到達不能）

// モジュールレベルのフラット 2D スクラッチ（dp / matched）を再利用し確保を廃す。
// JS は単一スレッド・同期実行のため安全。
let dpBuf = new Int32Array(0);
let matchedBuf = new Uint8Array(0);
function ensureScratch(size: number): void {
  if (dpBuf.length < size) {
    dpBuf = new Int32Array(size);
    matchedBuf = new Uint8Array(size);
  }
}

/** O(N) 線形走査で subsequence の存在判定（DP コスト回避の前段） */
function isSubsequence(q: string, t: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (q[qi] === t[ti]) qi++;
  }
  return qi === q.length;
}

/**
 * 位置選択 DP（spec 4.2）。q が t の subsequence のとき、境界・連続を優先する
 * 割り付けの採用位置列（t 上の昇順インデックス）を返す。非 subsequence は null。
 * DP スコアは位置選択にのみ使い、intraScore には用いない。
 */
function selectPositions(q: string, t: string, boundaries: ReadonlySet<number>): number[] | null {
  const M = q.length;
  const N = t.length;
  if (M === 0 || N === 0) return null;
  if (!isSubsequence(q, t)) return null;

  const cols = N + 1;
  ensureScratch((M + 1) * cols);
  const dp = dpBuf;
  const matched = matchedBuf;
  for (let j = 0; j <= N; j++) {
    dp[j] = 0; // 行0: データ先頭の読み飛ばしは無料
    matched[j] = 0;
  }

  for (let i = 1; i <= M; i++) {
    const row = i * cols;
    const prow = (i - 1) * cols;
    const qi = q[i - 1]!;
    dp[row] = NEG; // 列0（i≥1）は無効
    matched[row] = 0;
    for (let j = 1; j <= N; j++) {
      let best = NEG;
      let bestMatched = 0;

      // skip: t[j-1] を使わない
      const prevSkip = dp[row + j - 1]!;
      if (prevSkip > NEG) {
        best = prevSkip + (matched[row + j - 1]! ? GAP_START : GAP_EXTEND);
        bestMatched = 0;
      }

      // match: q[i-1] を t[j-1] に割り付け
      const diag = dp[prow + j - 1]!;
      if (qi === t[j - 1] && diag > NEG) {
        let bonus = 0;
        if (boundaries.has(j - 1)) bonus += BOUNDARY;
        if (matched[prow + j - 1]!) bonus += CONSECUTIVE;
        if (i === 1) bonus += FIRST_CHAR;
        const ms = diag + MATCH + bonus;
        if (ms >= best) {
          // 同点は match 側
          best = ms;
          bestMatched = 1;
        }
      }

      dp[row + j] = best;
      matched[row + j] = bestMatched;
    }
  }

  // 末尾の余りは無料 → dp[M][j] 最大の j（= 最後にマッチした位置）
  const mrow = M * cols;
  let bestJ = -1;
  let bestScore = NEG;
  for (let j = M; j <= N; j++) {
    if (dp[mrow + j]! > bestScore) {
      bestScore = dp[mrow + j]!;
      bestJ = j;
    }
  }
  if (bestJ < 0 || bestScore === NEG) return null;

  const positions: number[] = [];
  let ci = M;
  let cj = bestJ;
  while (ci > 0 && cj > 0) {
    if (matched[ci * cols + cj]!) {
      positions.push(cj - 1);
      ci--;
      cj--;
    } else {
      cj--;
    }
  }
  positions.reverse();
  return positions;
}

/** 採用位置列から intraScore を算出（spec 4.2） */
function scoreFromPositions(
  positions: readonly number[],
  queryLen: number,
  dataLen: number,
  boundaries: ReadonlySet<number>,
): number {
  let boundaryHits = 0;
  for (const p of positions) if (boundaries.has(p)) boundaryHits++;
  const boundaryRate = boundaryHits / queryLen;

  let longest = 1;
  let cur = 1;
  for (let k = 1; k < positions.length; k++) {
    if (positions[k]! === positions[k - 1]! + 1) {
      cur++;
      if (cur > longest) longest = cur;
    } else {
      cur = 1;
    }
  }
  const continuity = longest / queryLen;

  const startTerm = 1 - positions[0]! / dataLen;

  return W_BOUNDARY * boundaryRate + W_CONTINUITY * continuity + W_START * startTerm;
}

interface Candidate {
  readonly intraScore: number;
  readonly space: Space;
  readonly positions: number[];
}

export const tier2Flexible: Matcher = (q: NormalizedQuery, e: IndexEntry) => {
  let best: Candidate | null = null;
  // 評価順 かな > 訓令 > ヘボン。strict > で同点は先順位が残る（spec 5章）
  const consider = (
    qStr: string | null,
    qMask: number,
    t: string,
    dMask: number,
    boundaries: ReadonlySet<number>,
    space: Space,
  ): void => {
    if (qStr === null || qStr.length < MIN_LEN || t.length === 0) return;
    // 前置フィルタ: subsequence はクエリ全文字がデータに存在する必要（衝突は安全側）
    if ((qMask & ~dMask) !== 0) return;
    const positions = selectPositions(qStr, t, boundaries);
    if (positions === null) return;
    const intraScore = scoreFromPositions(positions, qStr.length, t.length, boundaries);
    if (best === null || intraScore > best.intraScore) best = { intraScore, space, positions };
  };

  consider(q.kana, q.kanaMask, e.kana.text, e.kanaMask, e.kanaBoundaries, 'kana');
  if (e.kunrei) consider(q.kunrei, q.kunreiMask, e.kunrei.text, e.kunreiMask, e.kunrei.boundaries, 'kunrei');
  if (e.hepburn) consider(q.hepburn, q.hepburnMask, e.hepburn.text, e.hepburnMask, e.hepburn.boundaries, 'hepburn');

  if (best === null) return null;
  const c: Candidate = best;
  return { tier: 2, intraScore: c.intraScore, space: c.space, positions: c.positions };
};
