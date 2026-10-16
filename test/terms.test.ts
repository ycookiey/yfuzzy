import { describe, it, expect } from 'vitest';
import { createIndex, search } from '../src/index.js';

const items = (q: string, data: string[]) => search(q, data).map((r) => r.item);
const first = (q: string, data: string[]) => search(q, data)[0];

describe('複数の語: 空白で区切った語をすべて含む item に絞る（spec 2.7）', () => {
  it('語の順番を問わない（今は 0 件の逆順も当たる）', () => {
    expect(first('cal goo', ['Google Calendar', 'Local Map'])).toMatchObject({ item: 'Google Calendar', tier: 1 });
    expect(first('カレンダー google', ['Google カレンダー', 'カレンダーアプリ比較'])).toMatchObject({
      item: 'Google カレンダー',
      tier: 1,
    });
  });

  it('各語が直接一致すれば tier 1（飛び飛びの全体の一致より上）', () => {
    expect(first('goo cal', ['Google Calendar'])).toMatchObject({ tier: 1 });
    expect(first('git pro', ['GitHub Profile'])).toMatchObject({ tier: 1 });
  });

  it('空白込みの全体の一致と高いほうを採る（今 tier 1 の item は変わらない）', () => {
    expect(first('source code', ['Code Source', 'Source Code'])).toMatchObject({ item: 'Source Code', score: 1 });
  });

  it('語ごとの一致は直接一致だけ（飛び飛び・誤字では語が当たったとみなさない）', () => {
    const r = search('cl co', ['Cloud Console', 'Color Picker']);
    expect(r[0]).toMatchObject({ item: 'Cloud Console', tier: 1 });
    expect(r.find((x) => x.item === 'Color Picker')?.tier ?? 9).toBeGreaterThan(1);
  });

  it('1 文字の語は先頭・単語の頭だけ', () => {
    const r = search('a b', ['Apple Banana', 'Crab Cake']);
    expect(r[0]).toMatchObject({ item: 'Apple Banana', tier: 1 });
    expect(r.find((x) => x.item === 'Crab Cake')?.tier ?? 9).toBeGreaterThan(1);
  });

  it('別の語は別の単語に当たる（claude c は Claude 自身に当てない）', () => {
    const r = search('claude c', ['Claude', 'Claude Code', 'Claude Design']);
    expect(r[0]).toMatchObject({ item: 'Claude Code', tier: 1 });
    expect(r.find((x) => x.item === 'Claude')?.tier ?? 9).toBeGreaterThan(1);
  });

  it('並び: 弱い語の段 → 語の順番 → 長さ', () => {
    // 段が同じなら順番どおりが上、段が上なら逆順でも上
    expect(items('photo edit', ['Edit photos online', 'Photography credits', 'Photo Editor Pro'])).toEqual([
      'Photo Editor Pro',
      'Edit photos online',
      'Photography credits',
    ]);
    const data = ['Rust で作る CLI ツール入門 - Zenn', 'GitHub - example/rust-cli: A small CLI written in Rust'];
    expect(items('cli rust', data)).toEqual([data[1], data[0]]);
    expect(items('rust cli', data)).toEqual([data[0], data[1]]);
  });

  it('ハイライトは各語の一致位置', () => {
    const r = search('cal goo', ['Google Calendar'], { includeMatches: true });
    expect(r[0]?.matches).toEqual([
      [0, 3],
      [7, 10],
    ]);
  });

  it('一致の種類は最も弱い語の種類', () => {
    expect(first('goo cal', ['Google Calendar'])?.kind).toBe('word');
  });

  it('limit をつけても、つけない結果の先頭と同じ（全体の一致を limit 件で打ち切っても順位が変わらない）', () => {
    const data = [
      'Google Calendar',
      'goo cal',
      'Calendar for Google',
      'my google calendar notes',
      'Goodbye Calgary',
      'gooey caramel',
      'Gooseberry Local',
      'agoo xcal',
      'Calligraphy Goods',
      'goocal',
      'Local Map',
      'Google',
    ];
    const idx = createIndex(data);
    for (const q of ['goo cal', 'cal goo', 'go ca', 'g c']) {
      for (const maxTier of [1, 2, 4] as const) {
        const full = idx.search(q, { maxTier, includeMatches: true });
        expect(full.length).toBeGreaterThan(3);
        for (let limit = 1; limit <= full.length; limit++) {
          expect(idx.search(q, { maxTier, includeMatches: true, limit })).toEqual(full.slice(0, limit));
        }
      }
    }
  });

  it('空白を含まないクエリ・末尾の空白は今までどおり', () => {
    const idx = createIndex(['Google Calendar', 'Local Map']);
    expect(idx.search('github ')).toEqual(idx.search('github'));
    expect(idx.search('cal').map((r) => r.item)).toEqual(['Google Calendar', 'Local Map'].filter((x) => /cal/i.test(x)));
  });
});
