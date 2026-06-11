// tier 1: 完全マッチ層（spec 4.1）。クエリ文字列がデータに連続して現れる。
// サブマッチ4種を固定優先順で評価し、intraScore 最大を採用（同点は先順位＝表の記載順）。
// 優先順（spec 5章タイブレーク）: かな前方 > かな部分 > romaji前方(訓令>ヘボン) > romaji部分(訓令>ヘボン)。

import type { Matcher, Space } from './types.js';
import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';

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

function prefix(query: string, data: string, space: Space, factor: number): Candidate | null {
  if (query.length === 0 || data.length === 0) return null;
  if (!data.startsWith(query)) return null;
  return { intraScore: (query.length / data.length) * factor, space, offset: 0, len: query.length };
}

function substring(
  query: string,
  data: string,
  space: Space,
  factor: number,
  minLen: number,
): Candidate | null {
  if (query.length < minLen || data.length === 0) return null;
  const idx = data.indexOf(query);
  if (idx <= 0) return null; // 0 = 前方一致（別サブマッチが担当）、<0 = 非一致
  return { intraScore: (query.length / data.length) * factor, space, offset: idx, len: query.length };
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

  // 1. かな前方一致
  consider(prefix(q.kana, kana, 'kana', KANA_PREFIX));
  // 2. かな部分一致（かなは1文字でも可）
  consider(substring(q.kana, kana, 'kana', KANA_SUBSTRING, 1));
  // 3. romaji 前方一致（訓令 → ヘボン。前方は最小長条件なし）
  if (q.kunrei !== null) consider(prefix(q.kunrei, kunrei, 'kunrei', ROMAJI_PREFIX));
  if (q.hepburn !== null) consider(prefix(q.hepburn, hepburn, 'hepburn', ROMAJI_PREFIX * HEPBURN_PENALTY));
  // 4. romaji 部分一致（訓令 → ヘボン。クエリ romaji 2文字以上）
  if (q.kunrei !== null) consider(substring(q.kunrei, kunrei, 'kunrei', ROMAJI_SUBSTRING, 2));
  if (q.hepburn !== null) consider(substring(q.hepburn, hepburn, 'hepburn', ROMAJI_SUBSTRING * HEPBURN_PENALTY, 2));

  if (best === null) return null;
  const c: Candidate = best;
  return { tier: 1, intraScore: c.intraScore, space: c.space, positions: range(c.len, c.offset) };
};
