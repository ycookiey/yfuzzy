import { describe, it, expect } from 'vitest';
import { expandQuery, DEFAULT_SEPARATORS } from '../src/expand.js';

describe('expandQuery (spec 3章)', () => {
  it('無効化時は [raw] のみ', () => {
    expect(expandQuery('レイ-クッシュ', false)).toEqual(['レイ-クッシュ']);
    expect(expandQuery('レイ-クッシュ', undefined as never)).toEqual(['レイ-クッシュ']);
  });

  it('separator を含まなければ [raw] のみ', () => {
    expect(expandQuery('カミナリ', true)).toEqual(['カミナリ']);
  });

  it('3経路: (c)リテラル → (a)除去 → (b)境界', () => {
    expect(expandQuery('レイ-クッシュ', true)).toEqual([
      'レイ-クッシュ', // (c)
      'レイクッシュ', // (a)
      'レイ クッシュ', // (b)
    ]);
  });

  it('末尾 separator は (a)除去 を生成しない', () => {
    expect(expandQuery('カミ-', true)).toEqual([
      'カミ-', // (c)
      'カミ ', // (b)
    ]);
  });

  it('(a)(b) が (c) と同一になる場合は重複排除', () => {
    // separator がスペースのみ → (b) は raw と同じ、(a) のみ追加
    expect(expandQuery('カ ミ', true)).toEqual([
      'カ ミ', // (c) = (b)
      'カミ', // (a)
    ]);
  });

  it('カスタム separator 配列', () => {
    expect(expandQuery('a/b', ['/'])).toEqual(['a/b', 'ab', 'a b']);
    // デフォルトに無い文字はデフォルトでは展開されない
    expect(expandQuery('a/b', true)).toEqual(['a/b']);
  });

  it('デフォルトセット', () => {
    expect(DEFAULT_SEPARATORS).toEqual(['-', ' ', '・', '_']);
  });

  it('空クエリは []', () => {
    expect(expandQuery('', true)).toEqual([]);
    expect(expandQuery('', false)).toEqual([]);
  });
});
