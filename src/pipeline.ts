// 実行モデル（spec 4.0）+ スコアリング・ソート・limit（spec 5章）。
// 公開 API（index.ts）から呼ばれる内部エンジン。

import { normalizeQuery, type NormalizedQuery } from './query.js';
import { expandQuery, type SeparatorConfig } from './expand.js';
import type { IndexEntry } from './entry.js';
import type { RomajiOption } from './romaji/convert.js';
import type { Matcher, TierMatch } from './tiers/types.js';
import { tier1Exact } from './tiers/tier1-exact.js';
import { tier2Flexible } from './tiers/tier2-flexible.js';

// tier 昇順。slice(0, maxTier) で実行対象を絞る（spec 4.0）。
// M7 で tier3/tier4 を末尾に追加する。
const ALL_MATCHERS: readonly Matcher[] = [tier1Exact, tier2Flexible];

/** pipeline 実行設定（index.ts が options から解決して渡す） */
export interface SearchConfig {
  readonly romaji: RomajiOption;
  readonly separatorExpansion: SeparatorConfig;
  readonly maxTier: number;
  readonly minScore: number;
  readonly limit: number | undefined;
  readonly includeMatches: boolean;
}

/** 1 item の照合結果（公開層が item を解決し SearchResult 化する。match は M8 の matches 用に保持） */
export interface SearchHit {
  readonly refIndex: number;
  readonly score: number;
  readonly tier: 1 | 2 | 3 | 4;
  readonly match: TierMatch;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** tier 間レンジ分離スコア（spec 5章）。tier1=(0.75,1] … tier4=(0,0.25] */
function finalScore(m: TierMatch): number {
  return (4 - m.tier + clamp01(m.intraScore)) / 4;
}

/** first-match-wins（spec 4.0）: tier 昇順で最初にマッチした tier を採用 */
function runMatchers(q: NormalizedQuery, e: IndexEntry, matchers: readonly Matcher[]): TierMatch | null {
  for (const matcher of matchers) {
    const m = matcher(q, e);
    if (m !== null) return m;
  }
  return null;
}

/** 1 item を全経路で照合し、最良（score 降順、同点は経路順）を返す */
function searchEntry(
  e: IndexEntry,
  paths: readonly NormalizedQuery[],
  matchers: readonly Matcher[],
): SearchHit | null {
  let best: SearchHit | null = null;
  for (const q of paths) {
    const m = runMatchers(q, e, matchers);
    if (m === null) continue;
    const score = finalScore(m);
    // strict > により同点は先の経路（(c)>(a)>(b)）が残る
    if (best === null || score > best.score) {
      best = { refIndex: e.refIndex, score, tier: m.tier, match: m };
    }
  }
  return best;
}

/**
 * 検索本体。query は生入力、entries は構築済みエントリ。
 * 経路展開・クエリ正規化は item 非依存なので item ループ前に1回だけ行う。
 */
export function runSearch(
  query: string,
  entries: readonly IndexEntry[],
  config: SearchConfig,
): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === '') return []; // 空文字・空白のみ（spec 7章）

  const pathStrings = expandQuery(trimmed, config.separatorExpansion);
  if (pathStrings.length === 0) return [];
  const paths = pathStrings.map((p) => normalizeQuery(p, config.romaji));

  const matchers = ALL_MATCHERS.slice(0, config.maxTier);

  const hits: SearchHit[] = [];
  for (const e of entries) {
    const hit = searchEntry(e, paths, matchers);
    if (hit !== null && hit.score >= config.minScore) hits.push(hit);
  }

  hits.sort((a, b) => b.score - a.score || a.refIndex - b.refIndex);
  return config.limit !== undefined ? hits.slice(0, config.limit) : hits;
}
