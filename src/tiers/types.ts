// tier matcher の共通インターフェース（spec 4章）。
// pipeline は tier 昇順の Matcher 配列を first-match-wins で走査する。

import type { NormalizedQuery } from '../query.js';
import type { IndexEntry } from '../entry.js';

/** 照合空間。matches 逆変換（M8）がどの空間の位置かを判別する */
export type Space = 'kana' | 'kunrei' | 'hepburn';

/** 1 tier の照合結果。null = 非マッチ */
export interface TierMatch {
  readonly tier: 1 | 2 | 3 | 4;
  /** tier 内相対スコア（0–1、大きいほど良い） */
  readonly intraScore: number;
  /** 一致した空間 */
  readonly space: Space;
  /** space 内の一致文字位置（tier 1/2 のみ。tier 3/4 は null）。matches 逆変換の入力 */
  readonly positions: readonly number[] | null;
}

/** q・e は bigram 遅延キャッシュのため mutable で受ける */
export type Matcher = (q: NormalizedQuery, e: IndexEntry) => TierMatch | null;
