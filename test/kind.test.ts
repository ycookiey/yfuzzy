import { describe, it, expect } from 'vitest';
import { search } from '../src/index.js';

const kindOf = (q: string, item: string, maxTier: 1 | 2 | 3 | 4 = 3) => search(q, [item], { maxTier })[0]?.kind;

describe('一致の種類 kind（spec 5章）', () => {
  it('tier 1: 先頭・単語の頭・頭文字・単語の途中', () => {
    expect(kindOf('cof', 'Coffee')).toBe('prefix');
    expect(kindOf('co', 'Source Code')).toBe('word');
    expect(kindOf('ac', 'Apple Cider')).toBe('initials');
    expect(kindOf('ac', 'Back')).toBe('inner');
    expect(kindOf('カミナリ', 'カミナリ')).toBe('prefix'); // 完全一致も先頭
  });

  it('tier 2: 飛び飛び、tier 3: 誤字、tier 4: 構造の類似', () => {
    expect(kindOf('kmnr', 'カミナリ')).toBe('subsequence');
    expect(kindOf('センタイ', 'センダイ')).toBe('typo');
    expect(kindOf('イイイアアア', 'アアアイイイ', 4)).toBe('similar');
  });

  it('tier と kind は対応する', () => {
    const r = search('ac', ['Apple Cider', 'Back', 'AC Adapter', 'Attic']);
    for (const x of r) {
      if (x.tier === 1) expect(['prefix', 'word', 'initials', 'inner']).toContain(x.kind);
    }
  });
});
