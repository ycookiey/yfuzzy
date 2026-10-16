// 公開型（design.md シグネチャ）。

import type { RomajiOption } from './romaji/convert.js';
import type { SeparatorConfig } from './expand.js';

export type { RomajiOption } from './romaji/convert.js';
export type { SeparatorConfig } from './expand.js';

/**
 * クエリの照合経路（spec 2.2）。'phonetic' はローマ字をかなに変換して照合、
 * 'literal' は変換せず入力文字のまま照合（かなはそれを打った打鍵とも照合）、'both' は両経路の最良を採る
 */
export type MatchingOption = 'literal' | 'phonetic' | 'both';

/** Index 構築時オプション（構築後は変更不可） */
export interface IndexOptions<T> {
  /** item から検索対象文字列を取り出す。T[] のとき必須（オーバーロードで強制） */
  getText?: (item: T) => string;
  /** ローマ字並列の方式。default 'both' */
  romaji?: RomajiOption;
  /** 区切り文字展開。default false */
  separatorExpansion?: SeparatorConfig;
  /** クエリの照合経路。default 'both' */
  matching?: MatchingOption;
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
/**
 * 一致の種類（spec 5章）。tier 1: prefix（item の先頭から）・word（単語の頭から）・initials（各単語の頭文字）・
 * inner（単語の途中）、tier 2: subsequence（飛び飛び）、tier 3: typo（誤字）、tier 4: similar（構造の類似）
 */
export type MatchKind = 'prefix' | 'word' | 'initials' | 'inner' | 'subsequence' | 'typo' | 'similar';

export interface SearchResult<T> {
  item: T;
  /** items 内の位置 */
  refIndex: number;
  /** 0–1、高いほど良い */
  score: number;
  /** マッチした層 */
  tier: 1 | 2 | 3 | 4;
  /** 一致の種類（複数の語のクエリでは最も弱い語の種類） */
  kind: MatchKind;
  /** 元文字列上の一致区間 [start, end)（includeMatches 時かつ tier 1/2 のみ） */
  matches?: readonly [number, number][];
}

/** 構築済み Index */
export interface SearchIndex<T> {
  search(query: string, options?: SearchOptions): SearchResult<T>[];
  readonly size: number;
}
