// =============================================================================
// Vendored from WanaKana v5.3.1 (https://github.com/WaniKani/WanaKana)
// Copyright (c) 2013 WaniKani Community Github — MIT License
// Full license text: ../../../THIRD_PARTY_NOTICES.md
//
// Ported to TypeScript and modified for yfuzzy. Modifications:
//   1. 記号変換を除外（wanakana の SPECIAL_SYMBOLS: `-`→ー, `/`→・ 等を不採用）。
//      yfuzzy は separator をリテラル扱いするため（spec 2.2 / 3章）。
//   2. 非IMEモード固定（applyMapping の convertEnding=true）。末尾の単独 `n` は
//      ん に確定する（pokemon → ぽけもん）。IME_MODE_MAP は移植しない。
//   3. 出力は常にひらがな。大文字→カタカナ変換は移植せず、カタカナ化は
//      呼び出し側（normalize step5）に委ねる。
//   4. memoize-one / dequal / customMapping / useObsoleteKana は不要のため除外。
//
// 元実装: src/toKana.js, src/utils/kanaMapping.js, src/utils/romajiToKanaMap.js
// =============================================================================

// ツリーノード。キー '' に変換後かな文字列、その他の1文字キーにサブツリーを持つ。
// 元実装の動的構造をそのまま移植するため、このファイル内に限り any で表現する。
/* eslint-disable @typescript-eslint/no-explicit-any */
type Tree = Record<string, any>;

// prettier-ignore
const BASIC_KUNREI: Record<string, any> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  k: { a: 'か', i: 'き', u: 'く', e: 'け', o: 'こ' },
  s: { a: 'さ', i: 'し', u: 'す', e: 'せ', o: 'そ' },
  t: { a: 'た', i: 'ち', u: 'つ', e: 'て', o: 'と' },
  n: { a: 'な', i: 'に', u: 'ぬ', e: 'ね', o: 'の' },
  h: { a: 'は', i: 'ひ', u: 'ふ', e: 'へ', o: 'ほ' },
  m: { a: 'ま', i: 'み', u: 'む', e: 'め', o: 'も' },
  y: { a: 'や', u: 'ゆ', o: 'よ' },
  r: { a: 'ら', i: 'り', u: 'る', e: 'れ', o: 'ろ' },
  w: { a: 'わ', i: 'ゐ', e: 'ゑ', o: 'を' },
  g: { a: 'が', i: 'ぎ', u: 'ぐ', e: 'げ', o: 'ご' },
  z: { a: 'ざ', i: 'じ', u: 'ず', e: 'ぜ', o: 'ぞ' },
  d: { a: 'だ', i: 'ぢ', u: 'づ', e: 'で', o: 'ど' },
  b: { a: 'ば', i: 'び', u: 'ぶ', e: 'べ', o: 'ぼ' },
  p: { a: 'ぱ', i: 'ぴ', u: 'ぷ', e: 'ぺ', o: 'ぽ' },
  v: { a: 'ゔぁ', i: 'ゔぃ', u: 'ゔ', e: 'ゔぇ', o: 'ゔぉ' },
};

const CONSONANTS: Record<string, string> = {
  k: 'き', s: 'し', t: 'ち', n: 'に', h: 'ひ', m: 'み', r: 'り',
  g: 'ぎ', z: 'じ', d: 'ぢ', b: 'び', p: 'ぴ', v: 'ゔ', q: 'く', f: 'ふ',
};
const SMALL_Y: Record<string, string> = { ya: 'ゃ', yi: 'ぃ', yu: 'ゅ', ye: 'ぇ', yo: 'ょ' };
const SMALL_VOWELS: Record<string, string> = { a: 'ぁ', i: 'ぃ', u: 'ぅ', e: 'ぇ', o: 'ぉ' };

const ALIASES: Record<string, string> = {
  sh: 'sy', ch: 'ty', cy: 'ty', chy: 'ty', shy: 'sy', j: 'zy', jy: 'zy',
  shi: 'si', chi: 'ti', tsu: 'tu', ji: 'zi', fu: 'hu',
};

const SMALL_LETTERS: Record<string, string> = {
  tu: 'っ', wa: 'ゎ', ka: 'ヵ', ke: 'ヶ',
  ...SMALL_VOWELS,
  ...SMALL_Y,
};

const SPECIAL_CASES: Record<string, string> = {
  yi: 'い', wu: 'う', ye: 'いぇ', wi: 'うぃ', we: 'うぇ', kwa: 'くぁ', whu: 'う',
  tha: 'てゃ', thu: 'てゅ', tho: 'てょ', dha: 'でゃ', dhu: 'でゅ', dho: 'でょ',
};

const AIUEO_CONSTRUCTIONS: Record<string, string> = {
  wh: 'う', kw: 'く', qw: 'く', q: 'く', gw: 'ぐ', sw: 'す', ts: 'つ',
  th: 'て', tw: 'と', dh: 'で', dw: 'ど', fw: 'ふ', f: 'ふ',
};

function transform(tree: Record<string, any>): Tree {
  return Object.entries(tree).reduce<Tree>((map, [char, subtree]) => {
    map[char] = typeof subtree === 'string' ? { '': subtree } : transform(subtree);
    return map;
  }, {});
}

function getSubTreeOf(tree: Tree, str: string): Tree {
  return str.split('').reduce<Tree>((node, char) => {
    if (node[char] === undefined) node[char] = {};
    return node[char];
  }, tree);
}

function createRomajiToKanaTree(): Tree {
  const kanaTree = transform(BASIC_KUNREI);
  const subtreeOf = (str: string): Tree => getSubTreeOf(kanaTree, str);

  // きゃ, しゃ 等
  Object.entries(CONSONANTS).forEach(([consonant, yKana]) => {
    Object.entries(SMALL_Y).forEach(([roma, kana]) => {
      subtreeOf(consonant + roma)[''] = yKana + kana;
    });
  });

  // 注: wanakana の SPECIAL_SYMBOLS（記号変換）はここで意図的に追加しない（改変点1）

  // うぃ, くぃ 等
  Object.entries(AIUEO_CONSTRUCTIONS).forEach(([consonant, aiueoKana]) => {
    Object.entries(SMALL_VOWELS).forEach(([vowel, kana]) => {
      subtreeOf(consonant + vowel)[''] = aiueoKana + kana;
    });
  });

  // ん の各表記
  ['n', "n'", 'xn'].forEach((nChar) => {
    subtreeOf(nChar)[''] = 'ん';
  });

  // c は k と等価（ただし chi/cha 等は別なので copy）
  kanaTree.c = JSON.parse(JSON.stringify(kanaTree.k));

  Object.entries(ALIASES).forEach(([str, alternative]) => {
    const allExceptLast = str.slice(0, str.length - 1);
    const last = str.charAt(str.length - 1);
    const parentTree = subtreeOf(allExceptLast);
    parentTree[last] = JSON.parse(JSON.stringify(subtreeOf(alternative)));
  });

  function getAlternatives(str: string): string[] {
    return [...Object.entries(ALIASES), ['c', 'k'] as [string, string]].reduce<string[]>(
      (list, [alt, roma]) => (str.startsWith(roma) ? list.concat(str.replace(roma, alt)) : list),
      [],
    );
  }

  Object.entries(SMALL_LETTERS).forEach(([kunreiRoma, kana]) => {
    const last = (char: string): string => char.charAt(char.length - 1);
    const allExceptLast = (chars: string): string => chars.slice(0, chars.length - 1);
    const xRoma = `x${kunreiRoma}`;
    const xSubtree = subtreeOf(xRoma);
    xSubtree[''] = kana;

    const parentTree = subtreeOf(`l${allExceptLast(kunreiRoma)}`);
    parentTree[last(kunreiRoma)] = xSubtree;

    getAlternatives(kunreiRoma).forEach((altRoma) => {
      ['l', 'x'].forEach((prefix) => {
        const altParentTree = subtreeOf(prefix + allExceptLast(altRoma));
        altParentTree[last(altRoma)] = subtreeOf(prefix + kunreiRoma);
      });
    });
  });

  Object.entries(SPECIAL_CASES).forEach(([str, kana]) => {
    subtreeOf(str)[''] = kana;
  });

  // kka, tta 等（促音）
  function addTsu(tree: Tree): Tree {
    return Object.entries(tree).reduce<Tree>((tsuTree, [key, value]) => {
      tsuTree[key] = !key ? `っ${value}` : addTsu(value);
      return tsuTree;
    }, {});
  }
  [...Object.keys(CONSONANTS), 'c', 'y', 'w', 'j'].forEach((consonant) => {
    const subtree = kanaTree[consonant];
    subtree[consonant] = addTsu(subtree);
  });
  // nn は っん にしない
  delete kanaTree.n.n;

  return Object.freeze(JSON.parse(JSON.stringify(kanaTree)));
}

let cachedTree: Tree | null = null;
function getTree(): Tree {
  if (cachedTree == null) cachedTree = createRomajiToKanaTree();
  return cachedTree;
}

type Token = [start: number, end: number, kana: string | null];

// 非IME固定のため convertEnding は常に true。
function applyMapping(str: string, mapping: Tree): Token[] {
  const root = mapping;

  function nextSubtree(tree: Tree, nextChar: string): Tree | undefined {
    const subtree = tree[nextChar];
    if (subtree === undefined) return undefined;
    return Object.assign({ '': tree[''] + nextChar }, tree[nextChar]);
  }

  function newChunk(remaining: string, currentCursor: number): Token[] {
    const firstChar = remaining.charAt(0);
    return parse(
      Object.assign({ '': firstChar }, root[firstChar]),
      remaining.slice(1),
      currentCursor,
      currentCursor + 1,
    );
  }

  function parse(tree: Tree, remaining: string, lastCursor: number, currentCursor: number): Token[] {
    if (!remaining) {
      // convertEnding=true 固定: 末尾も確定する
      return tree[''] ? [[lastCursor, currentCursor, tree['']]] : [];
    }
    if (Object.keys(tree).length === 1) {
      const head: Token = [lastCursor, currentCursor, tree['']];
      return [head, ...newChunk(remaining, currentCursor)];
    }
    const subtree = nextSubtree(tree, remaining.charAt(0));
    if (subtree === undefined) {
      const head: Token = [lastCursor, currentCursor, tree['']];
      return [head, ...newChunk(remaining, currentCursor)];
    }
    return parse(subtree, remaining.slice(1), lastCursor, currentCursor + 1);
  }

  return newChunk(str, 0);
}

/**
 * ローマ字→ひらがな変換（非IME・記号リテラル）。
 * 変換できない文字（子音のみ等）はそのまま残す。出力はひらがな。
 */
export function romajiToKana(input: string): string {
  return applyMapping(input.toLowerCase(), getTree())
    .map((token) => token[2] ?? '')
    .join('');
}
