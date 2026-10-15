import { describe, it, expect } from 'vitest';
import { normalizeQuery, type NormalizedQuery } from '../src/query.js';
import { buildEntry } from '../src/entry.js';
import { buildLattice, type Lattice } from '../src/lattice.js';
import { keystrokeTable } from '../src/keystroke.js';
import { tier1Exact } from '../src/tiers/tier1-exact.js';
import { tier2Flexible } from '../src/tiers/tier2-flexible.js';
import { tier3Typo } from '../src/tiers/tier3-typo.js';

describe('keystrokeTable（spec 2.2）', () => {
  const keys = (kana: string) => keystrokeTable().get(kana) ?? [];

  it('IME の表記: ci=シ, ce=セ, qu=ク（wanakana の ci=キ 等は採らない）', () => {
    expect(keys('シ')).toContain('ci');
    expect(keys('セ')).toContain('ce');
    expect(keys('ク')).toContain('qu');
    expect(keys('キ')).not.toContain('ci');
    expect(keys('ケ')).not.toContain('ce');
    expect(keys('クゥ')).not.toContain('qu');
  });

  it('ん は n / nn / n\' / xn、長音は -', () => {
    expect(keys('ン')).toEqual(expect.arrayContaining(['n', 'nn', "n'", 'xn']));
    expect(keys('ー')).toEqual(['-']);
  });

  it('促音: 子音の重ね打ちと tch', () => {
    expect(keys('ッカ')).toEqual(expect.arrayContaining(['kka', 'cca']));
    expect(keys('ッチ')).toEqual(expect.arrayContaining(['tti', 'cchi', 'tchi']));
    expect(keys('ッラ')).toContain('rra');
  });
});

describe('buildLattice（spec 2.2）', () => {
  it('かなを含まなければ null（文字列照合で足りる）', () => {
    expect(buildLattice('calendar')).toBeNull();
  });

  it('かなを含めば始点→終端の経路に入力そのものと打鍵列が並ぶ', () => {
    const lat = buildLattice('nカl')!;
    const all = paths(lat, 100).map(([s]) => s);
    expect(all).toEqual(expect.arrayContaining(['nカl', 'nkal', 'ncal']));
  });
});

// ラティス照合と「全経路を列挙して文字列として照合した最良値」の一致（内部整合性の検査。
// 期待値は同じ照合器の文字列版から作るため、照合器自体の正しさは他のテストが担う）
function paths(lat: Lattice, cap: number): [string, boolean][] {
  const out: [string, boolean][] = [];
  const walk = (v: number, s: string, ks: boolean): void => {
    if (out.length > cap) return;
    if (v === lat.final) out.push([s, ks]);
    for (let k = lat.outStart[v]!; k < lat.outStart[v + 1]!; k++) {
      const e = lat.outEdges[k]!;
      walk(lat.to[e]!, s + lat.ch[e]!, ks || lat.ks[e] === 1);
    }
  };
  walk(0, '', false);
  return out;
}

const plain = (s: string): NormalizedQuery => ({
  ...normalizeQuery(s, false, 'literal'),
  lattice: null,
  singleChar: false,
});

// 頭文字の一致の総当たり: 各文字を単語の頭から始め、続き（+1）か後ろの単語の頭に置けるか
function bruteInitials(s: string, data: string, heads: ReadonlySet<number>): boolean {
  const place = (i: number, prev: number): boolean => {
    if (i === s.length) return true;
    for (let p = prev + 1; p < data.length; p++) {
      if (data[p] !== s[i]) continue;
      const ok = i === 0 ? heads.has(p) : p === prev + 1 || heads.has(p);
      if (ok && place(i + 1, p)) return true;
    }
    return false;
  };
  return place(0, -1);
}

// tier 1 の総当たり: 段 =（先頭 3 / 単語の頭 2 / 頭文字 1 / 単語の途中 0）、intraScore = (段 + 素点) / 4。
// 打鍵経路は romaji 係数・部分一致は2文字以上（spec 4.1）
function bruteTier1(ps: [string, boolean][], data: string, heads: ReadonlySet<number>): number | null {
  let best: number | null = null;
  const N = data.length;
  const take = (cls: number, raw: number): void => {
    const v = (cls + raw) / 4;
    if (best === null || v > best) best = v;
  };
  for (const [s, ks] of ps) {
    const pf = ks ? 0.97 : 1;
    const sf = ks ? 0.87 : 0.9;
    if (data.startsWith(s)) take(3, (s.length / N) * pf);
    if (!ks || s.length >= 2) {
      for (let i = data.indexOf(s, 1); i > 0; i = data.indexOf(s, i + 1)) take(heads.has(i) ? 2 : 0, (s.length / N) * sf);
    }
    if (s.length >= 2 && heads.size >= 2 && bruteInitials(s, data, heads)) take(1, (s.length / N) * sf);
  }
  return best;
}

function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296;
}

describe('ラティス照合は全経路の総当たりと一致する（spec 2.2 / 4.1–4.3）', () => {
  const KANA = [...'かきくけこさしすせそちつてとなにのはひふまみむめもらりるれろやゆよわんあいうえおがじだばぱぁぃぇっゃゅょー'];
  const LATIN = [...'abcdefghijklmnopqrstuvwxyz'];
  const WORDS = ['Apple Cider', 'AirCooler', 'gold case', 'New Calendar', 'calendar', 'qiita', 'github', 'new calendar', 'kitchen', 'shinjuku', 'tsukuba', 'cherry', 'quiet', 'ceremony', 'jinja', 'xerox', 'lyric', 'whale', 'thermo', 'kyoto-city', "rock'n", 'sushi bar', 'カレンダー', 'シンジュクeki', 'abc-ー'];

  it('乱択 1500 組（tier 1 / 2 / 3）', () => {
    const r = lcg(42);
    const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
    let checked = 0;
    for (let it = 0; it < 1500; it++) {
      let q = '';
      const len = 1 + Math.floor(r() * 4);
      for (let k = 0; k < len; k++) q += r() < 0.7 ? pick(KANA) : pick(LATIN);
      const data =
        r() < 0.6
          ? pick(WORDS)
          : Array.from({ length: 3 + Math.floor(r() * 8) }, () => (r() < 0.8 ? pick(LATIN) : pick(KANA))).join('');
      const lq = normalizeQuery(q, false, 'literal');
      const e = buildEntry(data, 0, false);
      if (lq.lattice === null || !e.hasKeystrokeChar) continue;
      const ps = paths(lq.lattice, 5000);
      if (ps.length > 5000) continue;
      checked++;
      const ctx = `${q} / ${data}`;

      const t1 = tier1Exact(lq, e)?.intraScore ?? null;
      const b1 = bruteTier1(ps, e.kana.text, e.kanaBoundaries);
      expect(t1 === null, ctx).toBe(b1 === null);
      if (t1 !== null) expect(t1, ctx).toBeCloseTo(b1!, 12);

      let b2: number | null = null;
      let b3: number | null = null;
      for (const [s] of ps) {
        if (!(lq.singleChar && s.length < 2)) {
          const m2 = tier2Flexible(plain(s), e);
          if (m2 && (b2 === null || m2.intraScore > b2)) b2 = m2.intraScore;
        }
        const m3 = tier3Typo(plain(s), e);
        if (m3 && (b3 === null || m3.intraScore > b3)) b3 = m3.intraScore;
      }
      const t2 = tier2Flexible(lq, e)?.intraScore ?? null;
      const t3 = tier3Typo(lq, e)?.intraScore ?? null;
      expect(t2 === null, ctx).toBe(b2 === null);
      if (t2 !== null) expect(t2, ctx).toBeCloseTo(b2!, 12);
      expect(t3 === null, ctx).toBe(b3 === null);
      if (t3 !== null) expect(t3, ctx).toBeCloseTo(b3!, 12);
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
