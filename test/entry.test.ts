import { describe, it, expect } from 'vitest';
import { buildEntry, ensureBigrams } from '../src/entry.js';

describe('buildEntry (spec 2.3)', () => {
  it('基本: 正規化・両式 RomajiForm・境界・refIndex', () => {
    const e = buildEntry('シャツ', 3, 'both');
    expect(e.refIndex).toBe(3);
    expect(e.raw).toBe('シャツ');
    expect(e.kana.text).toBe('シャツ');
    expect(e.kunrei?.text).toBe('syatu');
    expect(e.hepburn?.text).toBe('shatsu');
    expect(e.kanaBoundaries).toEqual(new Set([0]));
    expect(e.bigrams).toBeNull();
  });

  it('ひらがな入力もカタカナへ正規化', () => {
    const e = buildEntry('さくら', 0, 'kunrei');
    expect(e.kana.text).toBe('サクラ');
    expect(e.kunrei?.text).toBe('sakura');
  });

  it('romaji オプション: kunrei のみ生成', () => {
    const e = buildEntry('カメラ', 0, 'kunrei');
    expect(e.kunrei).not.toBeNull();
    expect(e.hepburn).toBeNull();
  });

  it('romaji オプション: hepburn のみ生成', () => {
    const e = buildEntry('カメラ', 0, 'hepburn');
    expect(e.kunrei).toBeNull();
    expect(e.hepburn).not.toBeNull();
  });

  it('romaji オプション: false は両 RomajiForm null', () => {
    const e = buildEntry('カメラ', 0, false);
    expect(e.kunrei).toBeNull();
    expect(e.hepburn).toBeNull();
  });

  it('normMap 不変条件: map.length === kana.text.length', () => {
    const e = buildEntry('ﾊﾟ', 0, 'both'); // 半角→合成で n:1
    expect(e.kana.text).toBe('パ');
    expect(e.kana.map.length).toBe(e.kana.text.length);
    expect(e.kana.map[0]).toEqual([0, 2]); // パ は元 ﾊﾟ の [0,2) を覆う
  });

  it('境界: 漢字・separator の直後', () => {
    const e = buildEntry('林カ', 0, 'both');
    expect(e.kanaBoundaries).toEqual(new Set([0, 1]));
  });

  it('空文字 item: クラッシュせず空の表現', () => {
    const e = buildEntry('', 0, 'both');
    expect(e.kana.text).toBe('');
    expect(e.kunrei?.text).toBe('');
    expect(e.hepburn?.text).toBe('');
    expect(e.kanaBoundaries).toEqual(new Set([0]));
  });
});

describe('ensureBigrams (遅延生成)', () => {
  it('初回生成・2回目はキャッシュ参照', () => {
    const e = buildEntry('カミ', 0, false);
    expect(e.bigrams).toBeNull();
    const first = ensureBigrams(e);
    expect(first).toEqual(new Set(['^カ', 'カミ', 'ミ$']));
    expect(e.bigrams).toBe(first);
    expect(ensureBigrams(e)).toBe(first);
  });
});
