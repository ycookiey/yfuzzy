import { describe, it, expect } from 'vitest';
import { normalizeQuery, ensureQueryBigrams } from '../src/query.js';

describe('normalizeQuery (spec 2.2 / 2.3)', () => {
  it('ローマ字入力 → かな + 両式ローマ字', () => {
    const q = normalizeQuery('shinjuku', 'both');
    expect(q.kana).toBe('シンジュク');
    expect(q.kunrei).toBe('sinzyuku');
    expect(q.hepburn).toBe('shinjuku');
  });

  it('preKana が toKana の前に走る（全角S・大文字）', () => {
    const q = normalizeQuery('Ｓhi', 'both');
    expect(q.kana).toBe('シ');
    expect(q.kunrei).toBe('si');
    expect(q.hepburn).toBe('shi');
  });

  it('かな化できない子音列は素通り', () => {
    const q = normalizeQuery('msk', 'both');
    expect(q.kana).toBe('msk');
    expect(q.kunrei).toBe('msk');
    expect(q.hepburn).toBe('msk');
  });

  it('カタカナ入力はそのまま正規化', () => {
    const q = normalizeQuery('ピカ', 'both');
    expect(q.kana).toBe('ピカ');
    expect(q.kunrei).toBe('pika');
    expect(q.hepburn).toBe('pika');
  });

  it('romaji オプション: kunrei のみ', () => {
    const q = normalizeQuery('shi', 'kunrei');
    expect(q.kunrei).toBe('si');
    expect(q.hepburn).toBeNull();
  });

  it('romaji オプション: hepburn のみ', () => {
    const q = normalizeQuery('shi', 'hepburn');
    expect(q.kunrei).toBeNull();
    expect(q.hepburn).toBe('shi');
  });

  it('romaji オプション: false は両 romaji null（かな空間のみ）', () => {
    const q = normalizeQuery('shi', false);
    expect(q.kana).toBe('シ');
    expect(q.kunrei).toBeNull();
    expect(q.hepburn).toBeNull();
  });
});

describe('ensureQueryBigrams (遅延生成)', () => {
  it('初回生成・2回目はキャッシュ参照', () => {
    const q = normalizeQuery('カミ', false);
    expect(q.bigrams).toBeNull();
    const first = ensureQueryBigrams(q);
    expect(first).toEqual(new Set(['^カ', 'カミ', 'ミ$']));
    expect(q.bigrams).toBe(first);
    expect(ensureQueryBigrams(q)).toBe(first);
  });
});
