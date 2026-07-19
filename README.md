# yfuzzy

[![npm](https://img.shields.io/npm/v/@ycookiey/yfuzzy)](https://www.npmjs.com/package/@ycookiey/yfuzzy)
[![types](https://img.shields.io/npm/types/@ycookiey/yfuzzy)](https://www.npmjs.com/package/@ycookiey/yfuzzy)
[![minzipped](https://badgen.net/bundlephobia/minzip/@ycookiey/yfuzzy)](https://bundlephobia.com/package/@ycookiey/yfuzzy)
[![license](https://img.shields.io/npm/l/@ycookiey/yfuzzy)](./LICENSE)

日本語特化のあいまい検索ライブラリ。ローマ字混じり入力・ヘボン式/訓令式の同時照合・子音だけのマッチ・誤字許容を 1 パッケージに統合。依存ゼロ・ESM・TypeScript 型付き。

```
shinjuku / sinjuku / しんじゅく / シンジュク  →  すべて「シンジュク」にヒット
kmnr                                        →  「カミナリ」にヒット（子音だけ）
カナリ                                       →  「カミナリ」にヒット（とびとび一致）
センタイ                                     →  「センダイ」にヒット（誤字）
```

## なぜ yfuzzy か

既存のあいまい検索ライブラリ（fuse.js / fuzzysort / MiniSearch / uFuzzy / match-sorter など）はラテン文字圏を前提に設計されており、diacritics（発音区別符号）の除去や Unicode 正規化には対応するものの、**ローマ字とかなの変換や、ヘボン式・訓令式の違いを扱わない**。

日本語 UI では、利用者はローマ字・部分的なかな・子音だけ（上の例）で打つ一方、データはひらがな・カタカナ・漢字（の読み）で保持されている。yfuzzy はこの表記のずれを埋めることに特化している。

## スコープ

**向いている**: 日本語の読み（かな）を索引にした短い文字列の検索。駅名・地名・商品名・人名などの読みに対する、逐次検索（type-ahead）やオートコンプリート。

**向いていない**:

- **漢字をそのまま検索**: yfuzzy は漢字を読みに変換しない（文字どおりの一致のみ）。読みで当てたいなら読み仮名を用意し `getText` で返す（[使い方](#使い方)参照）。
- **ラテン文字の汎用あいまい検索 / 全文検索**（複数フィールド・トークン化・TF-IDF）: fuse.js / MiniSearch 等が成熟している。用途で使い分けるとよい。

## 類似パッケージとの比較

| 機能 | yfuzzy | [fuse.js](https://www.fusejs.io/) | [fuzzysort](https://github.com/farzher/fuzzysort) | [MiniSearch](https://github.com/lucaong/minisearch) | [uFuzzy](https://github.com/leeoniya/uFuzzy) | [match-sorter](https://github.com/kentcdodds/match-sorter) |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| 日本語入力（ローマ字↔かな・ヘボン/訓令・かな正規化） | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| 子音だけのマッチ | ✅ | ➖ | 🔸 | ➖ | 🔸 | 🔸 |
| とびとび一致（subsequence） | ✅ | 🔸 | ✅ | ➖ | ✅ | 🔸 |
| 誤字許容（編集距離） | ✅ | ✅ | ➖ | ✅ | 🔸 | ➖ |
| ハイライト位置の返却 | ✅ | ✅ | ✅ | 🔸 | ✅ | ➖ |
| 索引の事前構築 | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ |
| 全文検索（複数フィールド/トークン） | ➖ | ✅ | 🔸 | ✅ | ➖ | 🔸 |
| ラテン文字の diacritics 除去 | ➖ | ✅ | ➖ | 🔸 | ✅ | ✅ |
| 依存ゼロ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |

凡例: ✅ 組み込み / 🔸 部分的・間接的（または要カスタム） / ➖ なし。各ライブラリの調査時点の既定挙動を基準とした。多くはカスタム関数で拡張できる。本表は「日本語入力対応＋主要なあいまいマッチ機能」に観点を絞ったもの。

## インストール

```sh
npm install @ycookiey/yfuzzy
```

Node 18+ / ESM 専用。

### ブラウザ (CDN)

ビルドツールなしで使う場合は同梱の単一ファイル bundle を `<script>` で読み込む（グローバル `yfuzzy` が定義される）:

```html
<script src="https://unpkg.com/@ycookiey/yfuzzy@0.3.0/dist/yfuzzy.min.js"></script>
<script>
  yfuzzy.search('sinjuku', ['トウキョウ', 'シンジュク', 'シブヤ']);
  // → [{ item: 'シンジュク', refIndex: 1, score: 1, tier: 1 }]
</script>
```

## 使い方

### 文字列配列

```ts
import { search } from '@ycookiey/yfuzzy';

const stations = ['トウキョウ', 'シンジュク', 'シブヤ', 'シナガワ'];

search('sinjuku', stations);
// → [{ item: 'シンジュク', refIndex: 1, score: 1, tier: 1 }]
```

### オブジェクト配列（getText）

`getText` で検索対象の文字列を取り出す。漢字を読みで当てたい場合も、読み仮名を返せばよい（読みは利用者側で用意する）。

```ts
const items = [
  { label: '東京', yomi: 'トウキョウ' },
  { label: '新宿', yomi: 'シンジュク' },
];

search('しんじゅく', items, { getText: (x) => x.yomi });
// → [{ item: { label: '新宿', … }, refIndex: 1, score: 1, tier: 1 }]
```

### 索引の再利用（createIndex）

同じデータを繰り返し検索するなら事前構築する。単発 `search` と結果は同一。

```ts
import { createIndex } from '@ycookiey/yfuzzy';

const index = createIndex(stations);
index.search('しぶ');             // → 先頭は シブヤ（短い語なので tier3 候補も続く）
index.search('しな', { limit: 5 }); // 呼び出しごとに検索オプションを上書き
```

### ハイライト（includeMatches）

`includeMatches: true` で、**元文字列上**の一致区間 `[start, end)`（半開・昇順、隣接や重複は統合済み）を返す（後述の tier 1・2 でのみ）。各区間を `text.slice` で切り出して囲めばハイライトになる。

```ts
const r = search('keki', ['ケーキ'], { includeMatches: true });
// r[0].matches → [[0, 3]]   ← 長音「ー」も含めて隙間なく連続
```

## マッチの仕組み

クエリは tier 1 から順に評価され、最初に一致した tier で確定する（既定は tier 1〜3。`maxTier: 4` で tier 4 も有効化）。`score` は 0〜1 で、上の tier ほど高い。

| tier | 内容 | 例 | score の範囲（目安） |
|---|---|---|---|
| 1 | 直接一致（かな/ローマ字が前方・部分一致） | `シンジュク`→`シンジュク` | 0.75〜1.0 |
| 2 | 柔軟一致（とびとびでも可。語頭・連続を優遇、子音だけの入力も可） | `kmnr`→`カミナリ` | 0.5〜0.75 |
| 3 | 誤字許容（編集距離、中間の置換/挿入/削除/入れ替え） | `センタイ`→`センダイ` | 0.25〜0.5 |
| 4 | 構造類似（2 文字単位の重なりによる類似〔Tversky 係数〕、既定で無効） | 大きく崩れた入力 | 0〜0.25 |

各 tier は幅およそ 0.25 の帯に収まり、スコアが tier 間の境界（0.25 / 0.5 / 0.75）ちょうどになることはない。そのため閾値ひとつで「確実なヒット」と「あいまいな候補（『もしかして』表示向け）」を分離できる。結果は `score` 降順（同点は `refIndex` 昇順で安定）。

## API

### `search(query, items, options?)`

単発検索。`createIndex(items, options).search(query)` と等価。

### `createIndex(items, options?) → SearchIndex`

事前構築した索引を返す。`index.search(query, searchOptions?)` で呼び出しごとに検索オプションを上書きできる。`index.size` で件数。

### オプション

構築時オプション（`createIndex` / `search` の `options`）:

| 名前 | 型 | 既定 | 説明 |
|---|---|---|---|
| `getText` | `(item: T) => string` | なし | オブジェクト配列で検索対象文字列を取り出す（`T[]` のとき必須） |
| `romaji` | `'hepburn' \| 'kunrei' \| 'both' \| false` | `'both'` | ローマ字照合の方式。`false` でローマ字照合せず、かなのみで照合 |
| `separatorExpansion` | `boolean \| string[]` | `false` | 区切り文字を、取り除いた形と区切りとして扱う形の両方で照合（`true` で `['-', ' ', '・', '_']`） |

検索時オプション（`index.search` で上書き可）:

| 名前 | 型 | 既定 | 説明 |
|---|---|---|---|
| `limit` | `number` | 無制限 | 返却件数の上限 |
| `maxTier` | `1 \| 2 \| 3 \| 4` | `3` | 実行する tier の上限（`4` で構造類似の tier を有効化） |
| `minScore` | `number` | `0` | この score 未満を除外 |
| `includeMatches` | `boolean` | `false` | `matches` を含める |

### 結果 `SearchResult<T>`

```ts
type SearchResult<T> = {
  item: T;
  refIndex: number;                       // items 内の位置
  score: number;                          // 0〜1、高いほど良い
  tier: 1 | 2 | 3 | 4;
  matches?: readonly [number, number][];  // includeMatches 時、tier 1/2 のみ
};
```

## 性能

短い文字列の索引向け（数百〜数十万件）。内部の前段フィルタと早期打ち切りにより、1 クエリの実測値は千件で約 1.5ms、1 万件で約 10ms、10 万件で約 90ms（環境依存）。同条件で fuse.js より高速。`maxTier` を下げる、または `romaji` を一方の方式だけに絞ると更に軽くなる。索引構築は 10 万件で約 0.7 秒（一度きり）。

## ライセンス

MIT。ローマ字→かな変換に [WanaKana](https://github.com/WaniKani/WanaKana)（MIT）のコードを改変のうえ同梱している。詳細は [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
