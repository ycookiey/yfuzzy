// tier 4: 構造類似層（spec 4.4、デフォルト OFF）。文字順が大きく崩れた入力の最終救済。
// bigram 集合の Tversky 類似度（α=0.8）。閾値未満は非マッチ。
// bigram は遅延生成（maxTier:4 が per-call で要否不明、spec 判断メモ）。
// positions は返さない（tier 4 は matches 非対象、spec 6章）。

import type { Matcher } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';
import { ensureQueryBigrams } from '../query.js';
import { ensureBigrams } from '../entry.js';

const ALPHA = 0.8; // クエリ側にしかない bigram の罰則（重い）
const BETA = 0.2; // データ側にしかない bigram の罰則（軽い）
const THRESHOLD = 0.3;

export const tier4Structural: Matcher = (q: NormalizedQuery, e: IndexEntry) => {
  const qb = ensureQueryBigrams(q);
  const db = ensureBigrams(e);
  if (qb.size === 0 || db.size === 0) return null;

  let inter = 0;
  for (const b of qb) if (db.has(b)) inter++;
  const qOnly = qb.size - inter;
  const dOnly = db.size - inter;

  const denom = inter + ALPHA * qOnly + BETA * dOnly;
  if (denom === 0) return null;
  const tversky = inter / denom;
  if (tversky < THRESHOLD) return null;

  return { tier: 4, intraScore: tversky, space: 'kana', positions: null };
};
