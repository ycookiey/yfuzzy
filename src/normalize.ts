// 共通正規化（spec 2.1）。クエリ・データ両方に適用し、正規化カナ形と
// 元文字列への位置マップ（normMap）を生成する。
//
// 適用順（コードポイント単位、1パス）:
//   1. 全角スペース U+3000 → 半角スペース
//   2. 全角英数記号 U+FF01–FF5E → ASCII
//   3. ASCII 大文字 → 小文字
//   4. 半角カタカナ → 全角カタカナ（濁点/半濁点は合成）
//   5. ひらがな → カタカナ
// 漢字・絵文字・記号は無変換で通す。サロゲートペアは分断しない。

/** 元文字列上の半開区間 [start, end)（UTF-16 コードユニット） */
export type Span = readonly [number, number];

export interface Normalized {
  /** 正規化後の文字列 */
  readonly text: string;
  /**
   * map[i] = text のコードユニット i に対応する元文字列の [start, end)。
   * 不変条件: map.length === text.length。
   * n:1 変換（ｶﾞ→ガ）は元の両コードポイントを覆う区間を割り当てる。
   */
  readonly map: readonly Span[];
}

const IDEOGRAPHIC_SPACE = 0x3000;
const FULLWIDTH_ASCII_START = 0xff01;
const FULLWIDTH_ASCII_END = 0xff5e;
const FULLWIDTH_OFFSET = 0xfee0;
const ASCII_UPPER_START = 0x41;
const ASCII_UPPER_END = 0x5a;
const HW_KATAKANA_START = 0xff61;
const HW_KATAKANA_END = 0xff9d; // ﾝ まで（ﾞ FF9E / ﾟ FF9F は結合記号として別扱い）
const HW_DAKUTEN = 0xff9e;
const HW_HANDAKUTEN = 0xff9f;
const COMBINING_DAKUTEN = '゙';
const COMBINING_HANDAKUTEN = '゚';
const STANDALONE_DAKUTEN = '゛';
const STANDALONE_HANDAKUTEN = '゜';
const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;
const HIRA_TO_KATA_OFFSET = 0x60;

// 半角カタカナ FF61..FF9D → 全角（順序は Unicode ブロック順、61 文字）
const HW_KATA_TABLE =
  '。「」、・ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';

/**
 * 適用する変換ステップの範囲。
 * - 'all': 全ステップ（データ側 normalize 用）
 * - 'preKana': 手順 1–3（U+3000・全角英数・小文字化）。クエリ側 toKana の前段
 * - 'postKana': 手順 4–5（半角カナ合成・ひら→カタ）。クエリ側 toKana の後段
 */
export type TransformMode = 'all' | 'preKana' | 'postKana';

interface CodePointUnit {
  readonly cp: string;
  readonly start: number;
  readonly end: number;
}

function toUnits(raw: string): CodePointUnit[] {
  const units: CodePointUnit[] = [];
  let offset = 0;
  for (const cp of raw) {
    units.push({ cp, start: offset, end: offset + cp.length });
    offset += cp.length;
  }
  return units;
}

/**
 * 正規化のコア（spec 2.1）。mode で適用ステップを絞り、withMap で normMap 生成を制御する。
 * normalize()（mode='all'・map あり）と applyTransforms()（map なし）が共有する。
 */
function run(raw: string, mode: TransformMode, withMap: boolean): { text: string; map: Span[] } {
  const doPre = mode === 'all' || mode === 'preKana';
  const doPost = mode === 'all' || mode === 'postKana';
  const units = toUnits(raw);
  let text = '';
  const map: Span[] = [];

  for (let i = 0; i < units.length; i++) {
    const cur = units[i]!;
    const code = cur.cp.codePointAt(0)!;
    let out: string;
    let spanEnd = cur.end;

    if (doPre && code === IDEOGRAPHIC_SPACE) {
      out = ' ';
    } else if (doPre && code >= FULLWIDTH_ASCII_START && code <= FULLWIDTH_ASCII_END) {
      const half = String.fromCharCode(code - FULLWIDTH_OFFSET);
      out = half >= 'A' && half <= 'Z' ? half.toLowerCase() : half;
    } else if (doPre && code >= ASCII_UPPER_START && code <= ASCII_UPPER_END) {
      out = cur.cp.toLowerCase();
    } else if (doPost && code >= HW_KATAKANA_START && code <= HW_KATAKANA_END) {
      const base = HW_KATA_TABLE[code - HW_KATAKANA_START]!;
      const next = i + 1 < units.length ? units[i + 1]! : null;
      const nextCode = next ? next.cp.codePointAt(0)! : -1;
      if (nextCode === HW_DAKUTEN || nextCode === HW_HANDAKUTEN) {
        const mark = nextCode === HW_DAKUTEN ? COMBINING_DAKUTEN : COMBINING_HANDAKUTEN;
        const composed = (base + mark).normalize('NFC');
        if ([...composed].length === 1) {
          out = composed;
          spanEnd = next!.end;
          i++; // 結合記号を消費
        } else {
          out = base; // 合成不可（例: ア+ﾞ）→ 記号は次反復で単独処理
        }
      } else {
        out = base;
      }
    } else if (doPost && code === HW_DAKUTEN) {
      out = STANDALONE_DAKUTEN;
    } else if (doPost && code === HW_HANDAKUTEN) {
      out = STANDALONE_HANDAKUTEN;
    } else if (doPost && code >= HIRAGANA_START && code <= HIRAGANA_END) {
      out = String.fromCodePoint(code + HIRA_TO_KATA_OFFSET);
    } else {
      out = cur.cp; // 対象外ステップ・漢字・記号・絵文字などは無変換
    }

    if (withMap) {
      const span: Span = [cur.start, spanEnd];
      for (let k = 0; k < out.length; k++) map.push(span);
    }
    text += out;
  }

  return { text, map };
}

/** 共通正規化（全手順）+ normMap 生成。データ側 Index 構築用。 */
export function normalize(raw: string): Normalized {
  const { text, map } = run(raw, 'all', true);
  return { text, map };
}

/** 指定ステップのみ適用し文字列を返す（位置マップ不要のクエリ側用）。 */
export function applyTransforms(raw: string, mode: TransformMode): string {
  return run(raw, mode, false).text;
}
