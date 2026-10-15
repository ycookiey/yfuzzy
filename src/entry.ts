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
  /** かな空間の境界位置 = 単語の頭（spec 2.6） */
  readonly kanaBoundaries: ReadonlySet<number>;
  /** romaji 空間の単語の頭（単語の頭のかなから始まる音節の先頭。tier 1 の段、spec 4.1） */
  readonly kunreiHeads: ReadonlySet<number>;
  readonly hepburnHeads: ReadonlySet<number>;
  /** 各空間の文字集合マスク（前置フィルタ用、空間が無効なら 0） */
  readonly kanaMask: number;
  readonly kunreiMask: number;
  readonly hepburnMask: number;
  /** 訓令式 RomajiForm（romaji オプションで無効時 null） */
  readonly kunrei: RomajiForm | null;
  /** ヘボン式 RomajiForm（romaji オプションで無効時 null） */
  readonly hepburn: RomajiForm | null;
  /** 打鍵の文字（英小文字・'・-）を含むか。含まなければ打鍵ラティスの打鍵経路は一致し得ない */
  readonly hasKeystrokeChar: boolean;
  /** bigram 集合（tier 4 用、遅延生成） */
  bigrams: Set<string> | null;
}

const ASCII_LETTER = /[a-z]/;

/** 単語の頭（spec 2.6）: かな空間の境界に、元の文字列で英小文字の直後の英大文字を加える */
function wordHeads(kana: Normalized, raw: string): Set<number> {
  const heads = kanaBoundaries(kana.text);
  const t = kana.text;
  const at = (i: number): string => raw.slice(kana.map[i]![0], kana.map[i]![1]);
  for (let i = 1; i < t.length; i++) {
    if (!ASCII_LETTER.test(t[i]!) || !ASCII_LETTER.test(t[i - 1]!)) continue;
    const cur = at(i);
    const prev = at(i - 1);
    if (cur !== cur.toLowerCase() && prev === prev.toLowerCase()) heads.add(i);
  }
  return heads;
}

/** romaji 空間の単語の頭: 単語の頭のかなから始まる音節の先頭位置 */
function romajiHeads(form: RomajiForm | null, heads: ReadonlySet<number>): ReadonlySet<number> {
  const out = new Set<number>();
  if (form === null) return out;
  for (const s of form.syllables) if (heads.has(s.kanaStart)) out.add(s.romajiStart);
  return out;
}

/** 1 item からエントリを構築する */
export function buildEntry(raw: string, refIndex: number, romaji: RomajiOption): IndexEntry {
  const kana = normalize(raw);
  const kunrei = kunreiEnabled(romaji) ? toRomajiForm(kana.text, KUNREI) : null;
  const hepburn = hepburnEnabled(romaji) ? toRomajiForm(kana.text, HEPBURN) : null;
  const heads = wordHeads(kana, raw);
  return {
    refIndex,
    raw,
    kana,
    kanaBoundaries: heads,
    kunreiHeads: romajiHeads(kunrei, heads),
    hepburnHeads: romajiHeads(hepburn, heads),
    kanaMask: charMask(kana.text),
    kunreiMask: kunrei ? charMask(kunrei.text) : 0,
    hepburnMask: hepburn ? charMask(hepburn.text) : 0,
    kunrei,
    hepburn,
    hasKeystrokeChar: /[a-z'-]/.test(kana.text),
    bigrams: null,
  };
}

/** tier 4 実行時に bigram を遅延生成してキャッシュする */
export function ensureBigrams(entry: IndexEntry): Set<string> {
  if (entry.bigrams === null) entry.bigrams = generateBigrams(entry.kana.text);
  return entry.bigrams;
}
