// クエリ正規化の束ね（spec 2.2 / 2.3）。1経路分の文字列を NormalizedQuery にする。
// 経路展開（expand.ts）は呼び出し側で行い、各経路文字列を本モジュールへ渡す。
//
// 正規化順（spec 2.2）: preKana（手順1-3）→ toKana（ローマ字→かな、常時有効）→
// postKana（手順4-5）。toKana は romaji オプションと無関係（入力利便のため常時）。

import { applyTransforms } from './normalize.js';
import { toKana } from './to-kana.js';
import {
  KUNREI,
  HEPBURN,
  kunreiEnabled,
  hepburnEnabled,
  type RomajiOption,
} from './romaji/convert.js';
import { kanaToRomaji } from './syllable.js';
import { generateBigrams } from './bigram.js';
import { charMask } from './charmask.js';

/** クエリ1経路分の正規化結果 */
export interface NormalizedQuery {
  /** 正規化カナ形 */
  readonly kana: string;
  /** 正規化カナ形が1コードポイントか（tier 1 の1文字レンジ分離用、spec 4.1） */
  readonly singleChar: boolean;
  /**
   * かな変換前のリテラル形（spec 2.2）。英数1コードポイントのクエリが変換で
   * 形を変えた場合（母音 a/i/u/e/o と n）のみ非 null。tier 1 かな空間で並列照合し、
   * ASCII データへの中間一致が変換で不可能になるのを防ぐ
   */
  readonly literal: string | null;
  /** 訓令式ローマ字（romaji オプションで無効時 null） */
  readonly kunrei: string | null;
  /** ヘボン式ローマ字（romaji オプションで無効時 null） */
  readonly hepburn: string | null;
  /** 各空間の文字集合マスク（前置フィルタ用、空間が無効なら 0） */
  readonly kanaMask: number;
  readonly kunreiMask: number;
  readonly hepburnMask: number;
  /** bigram 集合（tier 4 用、遅延生成） */
  bigrams: Set<string> | null;
}

/** クエリ文字列（1経路分）を正規化する */
export function normalizeQuery(raw: string, romaji: RomajiOption): NormalizedQuery {
  const pre = applyTransforms(raw, 'preKana');
  const kana = applyTransforms(toKana(pre), 'postKana');
  const kunrei = kunreiEnabled(romaji) ? kanaToRomaji(kana, KUNREI) : null;
  const hepburn = hepburnEnabled(romaji) ? kanaToRomaji(kana, HEPBURN) : null;
  return {
    kana,
    singleChar: isSingleCodePoint(kana),
    literal: /^[a-z0-9]$/.test(pre) && pre !== kana ? pre : null,
    kunrei,
    hepburn,
    kanaMask: charMask(kana),
    kunreiMask: kunrei !== null ? charMask(kunrei) : 0,
    hepburnMask: hepburn !== null ? charMask(hepburn) : 0,
    bigrams: null,
  };
}

function isSingleCodePoint(s: string): boolean {
  if (s.length === 0) return false;
  return s.length === String.fromCodePoint(s.codePointAt(0)!).length;
}

/** tier 4 実行時に bigram を遅延生成してキャッシュする */
export function ensureQueryBigrams(q: NormalizedQuery): Set<string> {
  if (q.bigrams === null) q.bigrams = generateBigrams(q.kana);
  return q.bigrams;
}
