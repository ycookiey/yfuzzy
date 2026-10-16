// クエリ正規化の束ね（spec 2.2 / 2.3）。1経路分の文字列を NormalizedQuery にする。
// 経路展開（expand.ts）は呼び出し側で行い、各経路文字列を本モジュールへ渡す。
//
// 正規化順（spec 2.2）: preKana（手順1-3）→ toKana（ローマ字→かな、phonetic 経路のみ）→
// postKana（手順4-5）。literal 経路は toKana を通さず、データ側と同じ正規化になる。

import { applyTransforms } from './normalize.js';
import { toKana } from './to-kana.js';
import {
  KUNREI,
  HEPBURN,
  kunreiEnabled,
  hepburnEnabled,
  longVowelTable,
  type RomajiOption,
} from './romaji/convert.js';
import { kanaToRomaji } from './syllable.js';
import { generateBigrams } from './bigram.js';
import { charMask } from './charmask.js';
import { buildLattice, type Lattice } from './lattice.js';

/** クエリの照合経路（spec 2.2） */
export type QueryMode = 'phonetic' | 'literal';

/** クエリ1経路分の正規化結果 */
export interface NormalizedQuery {
  /** 正規化カナ形 */
  readonly kana: string;
  /** 正規化カナ形が1コードポイントか（tier 1 の1文字レンジ分離用、spec 4.1） */
  readonly singleChar: boolean;
  /** 訓令式ローマ字（romaji オプションで無効時・literal 経路では null） */
  readonly kunrei: string | null;
  /** ヘボン式ローマ字（romaji オプションで無効時・literal 経路では null） */
  readonly hepburn: string | null;
  /** 各空間の文字集合マスク（前置フィルタ用、空間が無効なら 0） */
  readonly kanaMask: number;
  readonly kunreiMask: number;
  readonly hepburnMask: number;
  /**
   * 長音の印つきローマ字（spec 2.2）。phonetic 経路で、母音の重なり（aa）か母音の後の - があるときだけ。
   * 母音の重なりを「母音 + -」にしてからかな・ローマ字にする（saab → sa-b）。データ側 long と照合する
   */
  readonly long: string | null;
  readonly longMask: number;
  /** 打鍵ラティス（literal 経路でかなを含むとき。それ以外は null で kana を文字列照合） */
  readonly lattice: Lattice | null;
  /**
   * literal 経路で kana が同じ展開経路の phonetic と同一か。打鍵の文字を含まないデータでは
   * ラティスは kana の文字列照合に帰着し phonetic が包含するため、照合を省く（pipeline が設定）
   */
  shadowed: boolean;
  /** bigram 集合（tier 4 用、遅延生成） */
  bigrams: Set<string> | null;
}

/** クエリ文字列（1経路分）を正規化する */
export function normalizeQuery(
  raw: string,
  romaji: RomajiOption,
  mode: QueryMode = 'phonetic',
): NormalizedQuery {
  const pre = applyTransforms(raw, 'preKana');
  const kana = applyTransforms(mode === 'phonetic' ? toKana(pre) : pre, 'postKana');
  // literal 経路の kana はデータ側 kana と同空間。romaji 化してもかな以外は同一文字列になるため生成しない
  const phonetic = mode === 'phonetic';
  const kunrei = phonetic && kunreiEnabled(romaji) ? kanaToRomaji(kana, KUNREI) : null;
  const hepburn = phonetic && hepburnEnabled(romaji) ? kanaToRomaji(kana, HEPBURN) : null;
  const long = phonetic ? longVowelForm(pre, romaji) : null;
  return {
    kana,
    singleChar: isSingleCodePoint(kana),
    kunrei,
    hepburn,
    kanaMask: charMask(kana),
    kunreiMask: kunrei !== null ? charMask(kunrei) : 0,
    hepburnMask: hepburn !== null ? charMask(hepburn) : 0,
    long,
    longMask: long !== null ? charMask(long) : 0,
    lattice: phonetic ? null : buildLattice(kana),
    shadowed: false,
    bigrams: null,
  };
}

const LONG_VOWEL = /([aiueo])\1|[aiueo]-/;

/** 長音の印つきローマ字（spec 2.2）。印が無ければ null */
function longVowelForm(pre: string, romaji: RomajiOption): string | null {
  const table = longVowelTable(romaji);
  if (table === null || !LONG_VOWEL.test(pre)) return null;
  const marked = pre.replace(/([aiueo])\1+/g, '$1-');
  return kanaToRomaji(applyTransforms(toKana(marked), 'postKana'), table);
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
