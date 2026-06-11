// 速度ベンチ（手動実行）。yfuzzy / fuse.js / fuzzysort を同一データで比較する。
// 競合は公開 API のブラックボックス呼び出しのみ（実装は参照しない）。
// 注: 品質比較ではない。fuse/fuzzysort は日本語ローマ字変換を持たないため
//     ヒット内容は yfuzzy と異なる。ここでは構築時間と検索スループットのみ測る。
//
// 実行: npm run bench  （内部で npm run build → node bench/run.js）
// dist/ を import するため事前ビルドが必要。

import { createIndex } from '../dist/index.js';
import Fuse from 'fuse.js';
import fuzzysort from 'fuzzysort';

const SYLLABLES = [
  'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'ソ',
  'タ', 'チ', 'ツ', 'テ', 'ト', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ',
  'ハ', 'ヒ', 'フ', 'ヘ', 'ホ', 'マ', 'ミ', 'ム', 'メ', 'モ',
  'ラ', 'リ', 'ル', 'レ', 'ロ', 'ヤ', 'ユ', 'ヨ', 'ワ', 'ン',
  'ア', 'イ', 'ウ', 'エ', 'オ', 'ガ', 'ギ', 'グ', 'ザ', 'ダ',
];

// 決定的擬似乱数（LCG）。結果再現のため Math.random は使わない。
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function genData(n) {
  const rnd = lcg(12345);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const len = 2 + Math.floor(rnd() * 5);
    let w = '';
    for (let k = 0; k < len; k++) w += SYLLABLES[Math.floor(rnd() * SYLLABLES.length)];
    out[i] = w;
  }
  return out;
}

function genQueries(data, count) {
  const rnd = lcg(999);
  const qs = [];
  for (let i = 0; i < count; i++) {
    const w = data[Math.floor(rnd() * data.length)];
    const cut = Math.max(2, Math.min(w.length, 2 + Math.floor(rnd() * 3)));
    qs.push(w.slice(0, cut));
  }
  return qs;
}

function time(fn) {
  const t = performance.now();
  const r = fn();
  return [performance.now() - t, r];
}

function benchYfuzzy(data, queries) {
  const [build, idx] = time(() => createIndex(data));
  let search = 0;
  for (const q of queries) {
    const [ms] = time(() => idx.search(q, { limit: 20 }));
    search += ms;
  }
  return { build, perQuery: search / queries.length };
}

function benchFuse(data, queries) {
  // blackbox: 既定設定の文字列配列検索
  const [build, fuse] = time(() => new Fuse(data, { includeScore: true }));
  let search = 0;
  for (const q of queries) {
    const [ms] = time(() => fuse.search(q, { limit: 20 }));
    search += ms;
  }
  return { build, perQuery: search / queries.length };
}

function benchFuzzysort(data, queries) {
  // blackbox: prepare（構築相当）→ go（検索）
  const [build, prepared] = time(() => data.map((s) => fuzzysort.prepare(s)));
  let search = 0;
  for (const q of queries) {
    const [ms] = time(() => fuzzysort.go(q, prepared, { limit: 20 }));
    search += ms;
  }
  return { build, perQuery: search / queries.length };
}

const SIZES = [1000, 10000, 100000];
const QUERY_COUNT = 30;

function fmt(n) {
  return n.toFixed(2).padStart(9);
}

console.log('yfuzzy benchmark (speed only; not a quality comparison)');
console.log(`queries per size: ${QUERY_COUNT}\n`);

for (const size of SIZES) {
  const data = genData(size);
  const queries = genQueries(data, QUERY_COUNT);

  const y = benchYfuzzy(data, queries);
  const f = benchFuse(data, queries);
  const z = benchFuzzysort(data, queries);

  console.log(`n = ${size}`);
  console.log('  lib          build(ms)   search/query(ms)');
  console.log(`  yfuzzy      ${fmt(y.build)}        ${fmt(y.perQuery)}`);
  console.log(`  fuse.js     ${fmt(f.build)}        ${fmt(f.perQuery)}`);
  console.log(`  fuzzysort   ${fmt(z.build)}        ${fmt(z.perQuery)}`);
  console.log('');
}
