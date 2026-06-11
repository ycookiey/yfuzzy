// 型テスト（コンパイル時。npm run typecheck = tsc で検証。vitest 実行対象外）。
// オーバーロードの強制とジェネリクスの流れを固定する。

import { expectTypeOf } from 'vitest';
import { search, createIndex } from '../src/index.js';
import type { SearchResult, SearchIndex } from '../src/index.js';

interface Item {
  id: number;
  name: string;
}
const items: Item[] = [{ id: 1, name: 'x' }];

// string[]: getText 不要、結果は SearchResult<string>[]
expectTypeOf(search('q', ['a', 'b'])).toEqualTypeOf<SearchResult<string>[]>();
expectTypeOf(createIndex(['a'])).toEqualTypeOf<SearchIndex<string>>();
expectTypeOf(createIndex(['a']).search('q')).toEqualTypeOf<SearchResult<string>[]>();

// T[] + getText: 結果に T が流れる
expectTypeOf(search('q', items, { getText: (o) => o.name })).toEqualTypeOf<SearchResult<Item>[]>();
expectTypeOf(createIndex(items, { getText: (o) => o.name })).toEqualTypeOf<SearchIndex<Item>>();

// T[] で getText 省略はコンパイルエラー
// @ts-expect-error getText is required for non-string items
search('q', items);
// @ts-expect-error getText is required for non-string items
createIndex(items);
