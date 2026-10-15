// 打鍵の逆引き（spec 2.2）。IME でローマ字入力した結果のかなを、それを生む打鍵列へ戻す。
// 変換木（vendor wanakana）の全エントリを元に、主要な IME（Mozc / Google 日本語入力の
// ローマ字表で確認）と食い違う表記を外し、IME が受理する表記と促音の打ち方を加える。

import { romajiKanaPairs } from './vendor/wanakana/romaji-to-kana.js';
import { applyTransforms } from './normalize.js';

// wanakana 独自で IME と食い違う表記（IME では ci=し, ce=せ, qu=く）
const NOT_IME: ReadonlySet<string> = new Set(['ci', 'ce', 'qu']);

// 変換木に無いが IME が受理する表記（打鍵列, かな）
const IME_EXTRA: readonly [string, string][] = [
  ['ci', 'し'],
  ['ce', 'せ'],
  ['qu', 'く'],
  ['nn', 'ん'],
  ['-', 'ー'],
  ["t'i", 'てぃ'],
  ["t'yu", 'てゅ'],
  ["d'i", 'でぃ'],
  ["d'yu", 'でゅ'],
  ["t'u", 'とぅ'],
  ["d'u", 'どぅ'],
  ['hwa', 'ふぁ'],
  ['hwi', 'ふぃ'],
  ['hwe', 'ふぇ'],
  ['hwo', 'ふぉ'],
  ['hwyu', 'ふゅ'],
  ['zwa', 'ずぁ'],
  ['zwi', 'ずぃ'],
  ['zwu', 'ずぅ'],
  ['zwe', 'ずぇ'],
  ['zwo', 'ずぉ'],
  ['wyi', 'ゐ'],
  ['wye', 'ゑ'],
];

// 促音: 次の音節の先頭の子音を重ねる（kka → っか）。tch は ch の前の促音（tchi → っち）
const DOUBLING = new Set('qvlxkgszjtdhfbpmyrwc');

let table: Map<string, string[]> | null = null;
let maxKanaLen = 0;

/** カタカナ正規形のかな列 → 打鍵列の一覧 */
export function keystrokeTable(): Map<string, string[]> {
  if (table !== null) return table;
  const t = new Map<string, Set<string>>();
  const add = (keys: string, kana: string): void => {
    const k = applyTransforms(kana, 'postKana');
    let s = t.get(k);
    if (s === undefined) t.set(k, (s = new Set()));
    s.add(keys);
  };
  const base: [string, string][] = [];
  for (const [keys, kana] of romajiKanaPairs()) {
    if (NOT_IME.has(keys)) continue;
    if (kana.startsWith('っ') && keys.length > 1 && keys[0] === keys[1]) continue; // 重ね打ちは下で一律に作る
    base.push([keys, kana]);
  }
  base.push(...IME_EXTRA);
  for (const [keys, kana] of base) {
    add(keys, kana);
    if (kana.startsWith('っ')) continue;
    if (DOUBLING.has(keys[0]!)) add(keys[0]! + keys, 'っ' + kana);
    if (keys.startsWith('ch')) add('t' + keys, 'っ' + kana);
  }
  for (const k of t.keys()) if (k.length > maxKanaLen) maxKanaLen = k.length;
  table = new Map([...t].map(([k, s]) => [k, [...s]]));
  return table;
}

/** 表のかな列の最大長 */
export function keystrokeMaxKanaLen(): number {
  keystrokeTable();
  return maxKanaLen;
}
