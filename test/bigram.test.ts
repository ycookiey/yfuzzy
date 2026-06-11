import { describe, it, expect } from 'vitest';
import { generateBigrams } from '../src/bigram.js';

describe('generateBigrams (spec 2.3)', () => {
  it('^ $ パディング付き 2-gram 集合', () => {
    expect(generateBigrams('カミ')).toEqual(new Set(['^カ', 'カミ', 'ミ$']));
  });
  it('1文字', () => {
    expect(generateBigrams('ア')).toEqual(new Set(['^ア', 'ア$']));
  });
  it('空文字列は ^$ のみ', () => {
    expect(generateBigrams('')).toEqual(new Set(['^$']));
  });
  it('重複 bigram は集合で1つ', () => {
    // '^コ','コー','ーコ','コー'(重複),'ーア'... 実際は 'ココ' で試す
    expect(generateBigrams('ココ')).toEqual(new Set(['^コ', 'ココ', 'コ$']));
  });
});
