# yfuzzy

日本語特化のあいまい検索ライブラリ。ローマ字混じり入力・訓令式/ヘボン式の並列照合・子音（頭文字）マッチ・誤字許容を 1 パッケージに統合。依存ゼロ・ESM・TypeScript 型付き。

```
shinjuku / sinjuku / しんじゅく / シンジュク  →  すべて「シンジュク」にヒット
kmnr                                        →  「カミナリ」にヒット（頭文字）
カナリ                                       →  「カミナリ」にヒット（飛び石）
センタイ                                     →  「センダイ」にヒット（誤字）
```

## インストール

```sh
npm install yfuzzy
```

Node 18+ / ESM 専用。

## クイックスタート

```ts
import { search } from 'yfuzzy';

const stations = ['トウキョウ', 'シンジュク', 'シブヤ', 'シナガワ'];

search('sinjuku', stations);
// → [{ item: 'シンジュク', refIndex: 1, score: 1, tier: 1 }]
```

オブジェクト配列は `getText` で検索対象文字列を取り出す:

```ts
const items = [
  { id: 1, yomi: 'トウキョウ' },
  { id: 2, yomi: 'シンジュク' },
];

search('しんじゅく', items, { getText: (x) => x.yomi });
// → [{ item: { id: 2, yomi: 'シンジュク' }, refIndex: 1, score: 1, tier: 1 }]
```

同じデータを繰り返し検索するなら `createIndex` で事前構築する（単発 `search` と結果は同一）:

```ts
import { createIndex } from 'yfuzzy';

const index = createIndex(stations);
index.search('しぶ');   // → シブヤ
index.search('しな', { limit: 5 });
```

## 漢字について

yfuzzy は**漢字を読みに変換しない**（リテラル一致のみ）。読みで検索させたい場合は、読み仮名を別途用意して `getText` で返す（読みの付与は利用者責務）。

```ts
const items = [{ label: '東京', yomi: 'トウキョウ' }];
search('toukyou', items, { getText: (x) => x.yomi }); // ヒット
search('toukyou', items, { getText: (x) => x.label }); // ヒットしない（漢字はそのまま）
```

## マッチの仕組み（4 層）

クエリは tier 昇順で評価され、最初に一致した層で確定する。`score` は 0–1（高いほど良い）で、層ごとにレンジが分離する。

| tier | 層 | 例 | score 帯 |
|---|---|---|---|
| 1 | 完全一致（かな/ローマ字の前方・部分一致） | `シンジュク`→`シンジュク` | (0.75, 1] |
| 2 | 柔軟（subsequence・境界/連続ボーナス・頭文字） | `kmnr`→`カミナリ` | (0.5, 0.75) |
| 3 | 誤字許容（編集距離、中間の置換/挿入/削除/転置） | `センタイ`→`センダイ` | (0.25, 0.5) |
| 4 | 構造類似（Tversky bigram、デフォルト無効） | 大きく崩れた入力 | (0, 0.25] |

`score` 帯が重ならないため、利用者は閾値だけで「確実なヒット」と「もしかして」を分離できる。

## ハイライト（matches）

`includeMatches: true` で、**元文字列上**の一致区間 `[start, end)`（半開・昇順・マージ済み）を返す（tier 1/2 のみ）。

```ts
const r = search('keki', ['ケーキ'], { includeMatches: true });
// r[0].matches → [[0, 3]]   ← 長音「ー」を含めて穴なし

function highlight(text: string, ranges: readonly [number, number][]): string {
  let out = '';
  let last = 0;
  for (const [s, e] of ranges) {
    out += text.slice(last, s) + '<mark>' + text.slice(s, e) + '</mark>';
    last = e;
  }
  return out + text.slice(last);
}
```

## API

### `search(query, items, options?)`

単発検索。`createIndex(items, options).search(query)` と等価。

### `createIndex(items, options?) → SearchIndex`

事前構築した索引を返す。`index.search(query, searchOptions?)` で per-call の検索オプションを上書きできる。`index.size` で件数。

### オプション

構築時オプション（`createIndex` / `search` の `options`）:

| 名前 | 型 | 既定 | 説明 |
|---|---|---|---|
| `getText` | `(item: T) => string` | — | オブジェクト配列で検索対象文字列を取り出す（`T[]` のとき必須） |
| `romaji` | `'hepburn' \| 'kunrei' \| 'both' \| false` | `'both'` | ローマ字照合の方式。`false` でかな空間のみ |
| `separatorExpansion` | `boolean \| string[]` | `false` | 区切り文字を「除去」「境界」両経路で展開（`true` で `['-', ' ', '・', '_']`） |

検索時オプション（`index.search` で上書き可）:

| 名前 | 型 | 既定 | 説明 |
|---|---|---|---|
| `limit` | `number` | 無制限 | 返却件数の上限 |
| `maxTier` | `1 \| 2 \| 3 \| 4` | `3` | 実行する層の上限（`4` で構造類似層を有効化） |
| `minScore` | `number` | `0` | この score 未満を除外 |
| `includeMatches` | `boolean` | `false` | `matches` を含める |

### 結果 `SearchResult<T>`

```ts
type SearchResult<T> = {
  item: T;
  refIndex: number;                       // items 内の位置
  score: number;                          // 0–1、高いほど良い
  tier: 1 | 2 | 3 | 4;
  matches?: readonly [number, number][];  // includeMatches 時、tier 1/2 のみ
};
```

結果は `score` 降順（同点は `refIndex` 昇順で安定）。

## 性能

短い文字列の索引向け（数百〜数十万件）。文字集合プレフィルタと tier 打ち切りにより、1 クエリの実測は概ね 千件 ~1.5ms / 1 万件 ~10ms / 10 万件 ~90ms（環境依存）。同条件で fuse.js より高速。`maxTier` を下げる / `romaji: 'kunrei'` で片方式に絞ると更に軽くなる。索引構築は 10 万件で ~0.7s（一度きり）。

## ライセンス

MIT。ローマ字→かな変換に [WanaKana](https://github.com/WaniKani/WanaKana)（MIT）のコードを改変同梱している。詳細は [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
