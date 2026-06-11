// クエリ側のローマ字→かな変換（spec 2.2）。vendor の薄いラッパ。
// 出力はひらがな（カタカナ化は normalize step5 が担当）。記号はリテラル維持、
// 末尾の単独 n は ん に確定、変換できない英字（子音のみ等）はそのまま残る。

import { romajiToKana } from './vendor/wanakana/romaji-to-kana.js';

export function toKana(input: string): string {
  return romajiToKana(input);
}
