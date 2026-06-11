import { describe, it, expect } from 'vitest';
import { tier4Structural } from '../src/tiers/tier4-structural.js';
import { buildEntry } from '../src/entry.js';
import { normalizeQuery } from '../src/query.js';
import { search } from '../src/index.js';

function run(query: string, data: string) {
  return tier4Structural(normalizeQuery(query, 'both'), buildEntry(data, 0, 'both'));
}

describe('tier4Structural (spec 4.4)', () => {
  it('Tversky α=0.8: イイイアアア vs アアアイイイ → 0.4', () => {
    const m = run('イイイアアア', 'アアアイイイ');
    // bigram 共通 {イイ, アア}=2、qのみ3、dのみ3 → 2/(2+0.8*3+0.2*3)=2/5
    expect(m).toMatchObject({ tier: 4, space: 'kana', positions: null });
    expect(m!.intraScore).toBeCloseTo(0.4, 10);
  });

  it('閾値 0.3 未満は null', () => {
    expect(run('カキクケコ', 'アアアイイイ')).toBeNull(); // bigram 共通ほぼ無し
  });

  it('遅延 bigram が生成・キャッシュされる', () => {
    const e = buildEntry('アアアイイイ', 0, 'both');
    expect(e.bigrams).toBeNull();
    tier4Structural(normalizeQuery('イイイアアア', 'both'), e);
    expect(e.bigrams).not.toBeNull();
  });
});

describe('tier4 ゲート（maxTier）', () => {
  it('既定 maxTier=3 では tier4 を実行しない（崩れた入力は不一致）', () => {
    expect(search('イイイアアア', ['アアアイイイ'])).toEqual([]);
  });

  it('maxTier:4 で tier4 が有効化される', () => {
    const r = search('イイイアアア', ['アアアイイイ'], { maxTier: 4 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ item: 'アアアイイイ', tier: 4 });
    expect(r[0]!.score).toBeCloseTo(0.4 / 4, 10); // (0 + 0.4)/4 = 0.1
  });
});
