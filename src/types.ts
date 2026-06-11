// 公開型（design.md シグネチャ）。

import type { RomajiOption } from './romaji/convert.js';
import type { SeparatorConfig } from './expand.js';

export type { RomajiOption } from './romaji/convert.js';
export type { SeparatorConfig } from './expand.js';

/** Index 構築時オプション（構築後は変更不可） */
export interface IndexOptions<T> {
  /** item から検索対象文字列を取り出す。T[] のとき必須（オーバーロードで強制） */
  getText?: (item: T) => string;
  /** ローマ字並列の方式。default 'both' */
  romaji?: RomajiOption;
  /** 区切り文字展開。default false */
  separatorExpansion?: SeparatorConfig;
}

/** 検索時オプション（per-call 上書き可） */
export interface SearchOptions {
  /** 返却件数上限。default 無制限 */
  limit?: number;
  /** 実行する tier 上限。default 3（4=Tversky はオプトイン） */
  maxTier?: 1 | 2 | 3 | 4;
  /** この score 未満を除外。default 0 */
  minScore?: number;
  /** matches（ハイライト用区間）を含める。default false */
  includeMatches?: boolean;
}

/** 検索結果1件 */
export interface SearchResult<T> {
  item: T;
  /** items 内の位置 */
  refIndex: number;
  /** 0–1、高いほど良い */
  score: number;
  /** マッチした層 */
  tier: 1 | 2 | 3 | 4;
  /** 元文字列上の一致区間 [start, end)（includeMatches 時かつ tier 1/2 のみ） */
  matches?: readonly [number, number][];
}

/** 構築済み Index */
export interface SearchIndex<T> {
  search(query: string, options?: SearchOptions): SearchResult<T>[];
  readonly size: number;
}
