import { describe, it, expect } from 'vitest';
import { search } from '../src/index.js';

describe('matches（spec 6章、includeMatches:true）', () => {
  it('tier1 かな前方一致: 連続区間にマージ', () => {
    const r = search('カミ', ['カミナリ'], { includeMatches: true });
    expect(r[0]!.matches).toEqual([[0, 2]]); // カミ = [0,1)+[1,2) → [0,2)
  });

  it('tier1 romaji 一致でも長音ーを虫食いにしない（keki → ケーキ 全域）', () => {
    const r = search('keki', ['ケーキ'], { includeMatches: true });
    // ケ(0-1)+ー(1-2)+キ(2-3)。ー は直前音節に帰属するため穴が開かない
    expect(r[0]!.matches).toEqual([[0, 3]]);
  });

  it('n:1 正規化（半角合成）は元区間全体を覆う（ｶﾞ → ガ）', () => {
    const r = search('ガ', ['ｶﾞ'], { includeMatches: true });
    expect(r[0]!.matches).toEqual([[0, 2]]); // 元 ｶﾞ の [0,2)
  });

  it('tier2 飛び石は複数区間（カナリ ⊆ カミナリ、かな空間隔離）', () => {
    const r = search('カナリ', ['カミナリ'], { includeMatches: true, romaji: false });
    // 位置 [0,2,3] → [0,1) と [2,3)+[3,4)=[2,4)
    expect(r[0]!.tier).toBe(2);
    expect(r[0]!.matches).toEqual([
      [0, 1],
      [2, 4],
    ]);
  });

  it('tier3 は matches を返さない（undefined）', () => {
    const r = search('カミネリ', ['カミナリ'], { includeMatches: true });
    expect(r[0]!.tier).toBe(3);
    expect(r[0]!.matches).toBeUndefined();
  });

  it('includeMatches 既定（false）では matches なし', () => {
    const r = search('カミ', ['カミナリ']);
    expect(r[0]!.matches).toBeUndefined();
  });
});
