// データ側派生表現（spec 2.3）。Index 構築時に item ごとの正規化・ローマ字を事前計算する。
// bigram は maxTier:4 が per-call で要否不明のため遅延生成（spec 判断メモ）。

import { normalize, type Normalized } from './normalize.js';
import {
  KUNREI,
  HEPBURN,
  kunreiEnabled,
  hepburnEnabled,
  type RomajiOption,
} from './romaji/convert.js';
import { toRomajiForm, kanaBoundaries, type RomajiForm } from './syllable.js';
import { generateBigrams } from './bigram.js';
import { charMask } from './charmask.js';

/** データ側エントリ（1 item 分の事前計算） */
export interface IndexEntry {
  /** items 内の位置 */
  readonly refIndex: number;
  /** getText 結果（元文字列。matches 逆変換の終点） */
  readonly raw: string;
  /** 正規化カナ形 + normMap */
  readonly kana: Normalized;
  /** かな空間の境界位置（spec 2.6） */
  readonly kanaBoundaries: ReadonlySet<number>;
  /** 各空間の文字集合マスク（前置フィルタ用、空間が無効なら 0） */
  readonly kanaMask: number;
  readonly kunreiMask: number;
  readonly hepburnMask: number;
  /** 訓令式 RomajiForm（romaji オプションで無効時 null） */
  readonly kunrei: RomajiForm | null;
  /** ヘボン式 RomajiForm（romaji オプションで無効時 null） */
  readonly hepburn: RomajiForm | null;
  /** bigram 集合（tier 4 用、遅延生成） */
  bigrams: Set<string> | null;
}

/** 1 item からエントリを構築する */
export function buildEntry(raw: string, refIndex: number, romaji: RomajiOption): IndexEntry {
  const kana = normalize(raw);
  const kunrei = kunreiEnabled(romaji) ? toRomajiForm(kana.text, KUNREI) : null;
  const hepburn = hepburnEnabled(romaji) ? toRomajiForm(kana.text, HEPBURN) : null;
  return {
    refIndex,
    raw,
    kana,
    kanaBoundaries: kanaBoundaries(kana.text),
    kanaMask: charMask(kana.text),
    kunreiMask: kunrei ? charMask(kunrei.text) : 0,
    hepburnMask: hepburn ? charMask(hepburn.text) : 0,
    kunrei,
    hepburn,
    bigrams: null,
  };
}

/** tier 4 実行時に bigram を遅延生成してキャッシュする */
export function ensureBigrams(entry: IndexEntry): Set<string> {
  if (entry.bigrams === null) entry.bigrams = generateBigrams(entry.kana.text);
  return entry.bigrams;
}
