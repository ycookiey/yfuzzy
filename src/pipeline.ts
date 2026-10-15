// 実行モデル（spec 4.0）+ スコアリング・ソート・limit（spec 5章）。
// 公開 API（index.ts）から呼ばれる内部エンジン。

import { normalizeQuery, type NormalizedQuery, type QueryMode } from './query.js';
import { expandQuery, type SeparatorConfig } from './expand.js';
import type { IndexEntry } from './entry.js';
import type { RomajiOption } from './romaji/convert.js';
import type { MatchingOption } from './types.js';
import type { Matcher, TierMatch } from './tiers/types.js';
import { tier1Exact } from './tiers/tier1-exact.js';
import { tier2Flexible } from './tiers/tier2-flexible.js';
import { tier3Typo } from './tiers/tier3-typo.js';
import { tier4Structural } from './tiers/tier4-structural.js';

// tier 昇順。slice(0, maxTier) で実行対象を絞る（spec 4.0）。
// 既定 maxTier=3 では tier4 は実行されない（インデックス3が範囲外）。
const ALL_MATCHERS: readonly Matcher[] = [tier1Exact, tier2Flexible, tier3Typo, tier4Structural];

/** pipeline 実行設定（index.ts が options から解決して渡す） */
export interface SearchConfig {
  readonly romaji: RomajiOption;
  readonly separatorExpansion: SeparatorConfig;
  readonly matching: MatchingOption;
  readonly maxTier: number;
  readonly minScore: number;
  readonly limit: number | undefined;
  readonly includeMatches: boolean;
}

/** matching オプションに対応する照合経路（評価順。spec 2.2 / 5章） */
function modesFor(matching: MatchingOption): readonly QueryMode[] {
  if (matching === 'literal') return ['literal'];
  if (matching === 'phonetic') return ['phonetic'];
  return ['literal', 'phonetic'];
}

/**
 * 展開経路文字列を照合経路ごとに正規化する。literal の kana が phonetic の kana と
 * 同一なら（かなのみ・かな化できない英字のみのクエリ）phonetic が包含するため省く。
 * 打鍵ラティスがあれば、打鍵の文字を含むデータでのみ照合するよう shadowed を立てる。
 */
function normalizePath(p: string, romaji: RomajiOption, modes: readonly QueryMode[]): NormalizedQuery[] {
  const qs = modes.map((mode) => normalizeQuery(p, romaji, mode));
  if (qs.length === 2 && qs[0]!.kana === qs[1]!.kana) {
    if (qs[0]!.lattice === null) return [qs[1]!];
    qs[0]!.shadowed = true;
  }
  return qs;
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

/**
 * 単一 tier の matcher を全経路で照合し、最良（score 降順、同点は経路順）を返す。
 * strict > により同点は先の経路が残る（経路順は runSearch の paths 構築順）。
 */
function bestPathAtTier(
  matcher: Matcher,
  e: IndexEntry,
  paths: readonly NormalizedQuery[],
): SearchHit | null {
  let best: SearchHit | null = null;
  for (const q of paths) {
    const m = matcher(q, e);
    if (m === null) continue;
    const score = finalScore(m);
    if (best === null || score > best.score) {
      best = { refIndex: e.refIndex, score, tier: m.tier, match: m };
    }
  }
  return best;
}

/**
 * 検索本体。query は生入力、entries は構築済みエントリ。
 * 経路展開・クエリ正規化は item 非依存なので item ループ前に1回だけ行う。
 *
 * 実行は tier-first 転置（tier 昇順の外ループ × エントリ内ループ）。各エントリは
 * 最初にマッチした tier で claim し以降の tier では評価しない（first-match-wins と等価）。
 * tier 完了時に limit 件溜まれば打ち切る: tier レンジは分離（tier1>tier2>…）し後続 tier は
 * 必ず下回るため、上位 limit 件は確定済みで結果は非転置と同一（spec 4.0/5章）。
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
  // 経路順（同点タイブレーク順、spec 5章）: 展開経路 (c)>(a)>(b) の各々で literal > phonetic
  const modes = modesFor(config.matching);
  const paths = pathStrings.flatMap((p) => normalizePath(p, config.romaji, modes));

  const matchers = ALL_MATCHERS.slice(0, config.maxTier);
  const { limit, minScore } = config;

  const hits: SearchHit[] = [];
  const claimed = new Uint8Array(entries.length); // 既にマッチ確定したエントリ

  for (const matcher of matchers) {
    for (let idx = 0; idx < entries.length; idx++) {
      if (claimed[idx]) continue;
      const hit = bestPathAtTier(matcher, entries[idx]!, paths);
      if (hit === null) continue;
      claimed[idx] = 1;
      if (hit.score >= minScore) hits.push(hit);
    }
    // tier 完了時点で limit を満たせば後続 tier は不要（レンジ分離による）
    if (limit !== undefined && hits.length >= limit) break;
  }

  hits.sort((a, b) => b.score - a.score || a.refIndex - b.refIndex);
  return limit !== undefined ? hits.slice(0, limit) : hits;
}
