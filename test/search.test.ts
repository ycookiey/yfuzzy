import { describe, it, expect } from 'vitest';
import { search, createIndex } from '../src/index.js';

describe('search 公開 API（M5: tier1 + pipeline）', () => {
  it('score 降順で返す（完全一致 1.0 が先頭）', () => {
    const r = search('カミ', ['カミナリ', 'カミ']);
    expect(r.map((x) => x.item)).toEqual(['カミ', 'カミナリ']);
    expect(r[0]!.score).toBeCloseTo(1, 10);
    expect(r[0]!.tier).toBe(1);
    expect(r[1]!.score).toBeCloseTo(0.875, 10); // (3 + 0.5)/4
  });

  it('ローマ字入力で検索できる', () => {
    const r = search('kaminari', ['カミナリ', 'ソラ']);
    expect(r.map((x) => x.item)).toEqual(['カミナリ']);
    expect(r[0]!.score).toBeCloseTo(1, 10);
  });

  it('refIndex を返す', () => {
    const r = search('カミ', ['ソラ', 'カミ']);
    expect(r[0]!.refIndex).toBe(1);
  });

  it('同点は refIndex 昇順（安定）', () => {
    const r = search('カミ', ['カミ', 'カミ']);
    expect(r.map((x) => x.refIndex)).toEqual([0, 1]);
  });

  it('空クエリ・空白のみは []', () => {
    expect(search('', ['カミ'])).toEqual([]);
    expect(search('   ', ['カミ'])).toEqual([]);
  });

  it('limit で件数制限', () => {
    const r = search('カ', ['カミ', 'カメ', 'カサ'], { limit: 2 });
    expect(r).toHaveLength(2);
  });

  it('minScore でフィルタ', () => {
    // 'カミ' 完全一致=1.0、'カミナリ' 前方=0.875。minScore 0.9 で後者を除外
    const r = search('カミ', ['カミナリ', 'カミ'], { minScore: 0.9 });
    expect(r.map((x) => x.item)).toEqual(['カミ']);
  });

  it('T[] + getText でオブジェクト検索、item は元オブジェクト', () => {
    const items = [{ name: 'カミ' }, { name: 'ソラ' }];
    const r = search('カミ', items, { getText: (o) => o.name });
    expect(r[0]!.item).toBe(items[0]);
  });

  it('マッチ無しは []', () => {
    expect(search('ソラ', ['カミ', 'カメ'])).toEqual([]);
  });
});

describe('createIndex（search と等価・再利用）', () => {
  it('search(q, items, opts) ≡ createIndex(items, opts).search(q)', () => {
    const items = ['カミナリ', 'カミ', 'カメ'];
    const direct = search('カミ', items);
    const viaIndex = createIndex(items).search('カミ');
    expect(viaIndex).toEqual(direct);
  });

  it('size を持ち、per-call で SearchOptions を上書きできる', () => {
    const idx = createIndex(['カミ', 'カメ', 'カサ'], { limit: 1 });
    expect(idx.size).toBe(3);
    expect(idx.search('カ')).toHaveLength(1); // 構築時 limit=1
    expect(idx.search('カ', { limit: 3 })).toHaveLength(3); // per-call 上書き
  });

  it('T[] + getText', () => {
    const items = [{ id: 10, name: 'カミ' }];
    const idx = createIndex(items, { getText: (o) => o.name });
    const r = idx.search('カミ');
    expect(r[0]!.item).toBe(items[0]);
    expect(r[0]!.refIndex).toBe(0);
  });
});
