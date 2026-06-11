// yfuzzy 公開 API（design.md シグネチャ）。
// 単発 search は createIndex の薄いラッパ（spec 1章: 両者は完全等価）。

import { buildEntry, type IndexEntry } from './entry.js';
import { runSearch, type SearchConfig } from './pipeline.js';
import { computeMatches } from './matches.js';
import type {
  IndexOptions,
  SearchOptions,
  SearchResult,
  SearchIndex,
} from './types.js';

export type {
  IndexOptions,
  SearchOptions,
  SearchResult,
  SearchIndex,
  RomajiOption,
  SeparatorConfig,
} from './types.js';

const DEFAULT_MAX_TIER = 3;
const DEFAULT_MIN_SCORE = 0;

function resolveConfig(
  romaji: SearchConfig['romaji'],
  separatorExpansion: SearchConfig['separatorExpansion'],
  opts: SearchOptions,
): SearchConfig {
  return {
    romaji,
    separatorExpansion,
    maxTier: opts.maxTier ?? DEFAULT_MAX_TIER,
    minScore: opts.minScore ?? DEFAULT_MIN_SCORE,
    limit: opts.limit,
    includeMatches: opts.includeMatches ?? false,
  };
}

// ---- createIndex ----

export function createIndex(
  items: readonly string[],
  options?: IndexOptions<string> & SearchOptions,
): SearchIndex<string>;
export function createIndex<T>(
  items: readonly T[],
  options: IndexOptions<T> & SearchOptions & { getText: (item: T) => string },
): SearchIndex<T>;
export function createIndex<T>(
  items: readonly T[],
  options: IndexOptions<T> & SearchOptions = {},
): SearchIndex<T> {
  const getText = options.getText ?? ((x: T) => x as unknown as string);
  const romaji = options.romaji ?? 'both';
  const separatorExpansion = options.separatorExpansion ?? false;

  // 構築時に SearchOptions のデフォルトを保持（per-call で上書き可）
  const defaults: SearchOptions = {
    limit: options.limit,
    maxTier: options.maxTier,
    minScore: options.minScore,
    includeMatches: options.includeMatches,
  };

  const entries: IndexEntry[] = items.map((item, i) => buildEntry(getText(item), i, romaji));

  return {
    size: items.length,
    search(query: string, searchOptions: SearchOptions = {}): SearchResult<T>[] {
      const merged: SearchOptions = { ...defaults, ...searchOptions };
      const config = resolveConfig(romaji, separatorExpansion, merged);
      const hits = runSearch(query, entries, config);
      return hits.map((h) => {
        const result: SearchResult<T> = {
          item: items[h.refIndex]!,
          refIndex: h.refIndex,
          score: h.score,
          tier: h.tier,
        };
        // tier 1/2 のみ matches を付与（tier 3/4 は positions=null → undefined のまま）
        if (config.includeMatches && h.match.positions !== null) {
          result.matches = computeMatches(entries[h.refIndex]!, h.match);
        }
        return result;
      });
    },
  };
}

// ---- search（単発） ----

export function search(
  query: string,
  items: readonly string[],
  options?: IndexOptions<string> & SearchOptions,
): SearchResult<string>[];
export function search<T>(
  query: string,
  items: readonly T[],
  options: IndexOptions<T> & SearchOptions & { getText: (item: T) => string },
): SearchResult<T>[];
export function search<T>(
  query: string,
  items: readonly T[],
  options: IndexOptions<T> & SearchOptions = {},
): SearchResult<T>[] {
  // createIndex が SearchOptions をデフォルト保持するため search(query) で同値
  return createIndex(items as readonly T[], options as never).search(query);
}
