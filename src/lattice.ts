// 打鍵ラティス（spec 2.2）。literal 経路のクエリを「位置ごとの選択肢の列」として表す。
// 各位置に入力文字そのものの辺、かなの位置にはそのかなを生む打鍵列（keystroke.ts）の辺の鎖を張る。
// 節点番号は位相順（辺は常に番号の小さい節点から大きい節点へ）。

import { keystrokeTable, keystrokeMaxKanaLen } from './keystroke.js';
import { charMask } from './charmask.js';

export interface Lattice {
  readonly nodeCount: number;
  /** 終端節点（始点は 0） */
  readonly final: number;
  /** 辺（from 昇順）。ks=1 は打鍵の辺 */
  readonly from: Int32Array;
  readonly to: Int32Array;
  readonly ch: readonly string[];
  readonly ks: Uint8Array;
  /** 辺の文字の charMask ビット */
  readonly bit: Int32Array;
  /** 節点 v から出る辺の添字 outEdges[outStart[v] .. outStart[v+1]) */
  readonly outStart: Int32Array;
  readonly outEdges: Int32Array;
  /** 始点から出る辺の文字 */
  readonly firstChars: ReadonlySet<string>;
}

/** 正規化済み literal 文字列からラティスを作る。打鍵の辺が無ければ null（文字列照合で足りる） */
export function buildLattice(s: string): Lattice | null {
  const table = keystrokeTable();
  const maxLen = keystrokeMaxKanaLen();
  const n = s.length;
  // 仮番号: 位置節点 0..n、中間節点は n+1 以降。位相順へは後で振り直す
  const order: number[][] = Array.from({ length: n + 1 }, (_, i) => [i]);
  let next = n + 1;
  const edges: [number, number, string, number][] = [];
  const seen = new Set<string>();
  const addEdge = (f: number, t: number, c: string, k: number): void => {
    const key = `${f},${t},${c},${k}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push([f, t, c, k]);
  };
  let hasAlt = false;

  for (let i = 0; i < n; i++) {
    addEdge(i, i + 1, s[i]!, 0);
    // 同じ始点の打鍵列は接頭辞を共有する（trie）
    const trie = new Map<string, number>();
    for (let L = 1; L <= maxLen && i + L <= n; L++) {
      const keys = table.get(s.slice(i, i + L));
      if (keys === undefined) continue;
      for (const k of keys) {
        hasAlt = true;
        let cur = i;
        for (let p = 0; p < k.length - 1; p++) {
          const prefix = k.slice(0, p + 1);
          let node = trie.get(prefix);
          if (node === undefined) {
            node = next++;
            trie.set(prefix, node);
            order[i]!.push(node);
          }
          addEdge(cur, node, k[p]!, 1);
          cur = node;
        }
        addEdge(cur, i + L, k[k.length - 1]!, 1);
      }
    }
  }
  if (!hasAlt) return null;

  const remap = new Int32Array(next);
  let id = 0;
  for (const group of order) for (const v of group) remap[v] = id++;
  const m = edges.length;
  const list = edges.map(([f, t, c, k]) => [remap[f]!, remap[t]!, c, k] as const);
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const from = new Int32Array(m);
  const to = new Int32Array(m);
  const ch: string[] = new Array(m);
  const ks = new Uint8Array(m);
  const bit = new Int32Array(m);
  list.forEach(([f, t, c, k], e) => {
    from[e] = f;
    to[e] = t;
    ch[e] = c;
    ks[e] = k;
    bit[e] = charMask(c);
  });
  const V = id;
  const outStart = new Int32Array(V + 1);
  for (let e = 0; e < m; e++) outStart[from[e]! + 1]!++;
  for (let v = 0; v < V; v++) outStart[v + 1]! += outStart[v]!;
  const outEdges = new Int32Array(m);
  for (let e = 0; e < m; e++) outEdges[e] = e; // 辺は from 昇順に並んでいる
  const firstChars = new Set<string>();
  for (let k = outStart[0]!; k < outStart[1]!; k++) firstChars.add(ch[outEdges[k]!]!);
  return { nodeCount: V, final: remap[n]!, from, to, ch, ks, bit, outStart, outEdges, firstChars };
}

let reachBuf = new Uint8Array(0);
function reachScratch(size: number): Uint8Array {
  if (reachBuf.length < size) reachBuf = new Uint8Array(size);
  reachBuf.fill(0, 0, size);
  return reachBuf;
}

/** 全文字が dMask に含まれうる経路が始点→終端にあるか（charMask の衝突は安全側） */
export function latticeFeasible(lat: Lattice, dMask: number): boolean {
  const reach = reachScratch(lat.nodeCount);
  reach[0] = 1;
  for (let e = 0; e < lat.from.length; e++) {
    if (reach[lat.from[e]!] && (lat.bit[e]! & dMask) !== 0) reach[lat.to[e]!] = 1;
  }
  return reach[lat.final] === 1;
}

/**
 * ラティスのいずれかの経路が data の subsequence か（tier 2 前段の線形判定）。
 * skipDirect は始点→終端の直結辺（長さ1の経路）を除く。
 */
export function latticeIsSubsequence(lat: Lattice, data: string, skipDirect: boolean): boolean {
  const reach = reachScratch(lat.nodeCount);
  reach[0] = 1;
  for (let j = 0; j < data.length; j++) {
    const c = data[j]!;
    // 位相順の逆で走査し、同じ文字で2辺進まないようにする
    for (let v = lat.nodeCount - 1; v >= 0; v--) {
      if (!reach[v]) continue;
      for (let k = lat.outStart[v]!; k < lat.outStart[v + 1]!; k++) {
        const e = lat.outEdges[k]!;
        if (lat.ch[e] !== c) continue;
        if (skipDirect && v === 0 && lat.to[e] === lat.final) continue;
        reach[lat.to[e]!] = 1;
      }
    }
    if (reach[lat.final]) return true;
  }
  return false;
}

/** 連続一致の結果。打鍵の辺を通らない経路（plain）と通る経路（ks）それぞれの最長一致長 */
export interface ContiguousMatch {
  plain: number;
  ks: number;
}

// 連続一致の状態集合（状態 = 節点*2 + 打鍵経由フラグ）。重複除去用の世代印付き
let curList = new Int32Array(0);
let nxtList = new Int32Array(0);
let stamp = new Int32Array(0);
let gen = 0;

/**
 * data[start..] の先頭からラティスの始点→終端の経路が連続一致する最長の長さを、
 * 経路種別（打鍵の辺を通るか）ごとに out へ書く。一致なしは 0。
 */
export function contiguousAt(lat: Lattice, data: string, start: number, out: ContiguousMatch): void {
  out.plain = 0;
  out.ks = 0;
  const S = lat.nodeCount * 2;
  if (stamp.length < S) {
    stamp = new Int32Array(S);
    curList = new Int32Array(S);
    nxtList = new Int32Array(S);
    gen = 0;
  }
  let cur = curList;
  let nxt = nxtList;
  let curLen = 1;
  cur[0] = 0;
  const finalPlain = lat.final * 2;
  for (let j = start; j < data.length && curLen > 0; j++) {
    const c = data[j]!;
    gen++;
    let nxtLen = 0;
    for (let a = 0; a < curLen; a++) {
      const st = cur[a]!;
      const v = st >> 1;
      const f = st & 1;
      for (let k = lat.outStart[v]!; k < lat.outStart[v + 1]!; k++) {
        const e = lat.outEdges[k]!;
        if (lat.ch[e] !== c) continue;
        const ns = lat.to[e]! * 2 + (f | lat.ks[e]!);
        if (stamp[ns] === gen) continue;
        stamp[ns] = gen;
        nxt[nxtLen++] = ns;
      }
    }
    const len = j - start + 1;
    if (stamp[finalPlain] === gen) out.plain = len;
    if (stamp[finalPlain + 1] === gen) out.ks = len;
    const t = cur;
    cur = nxt;
    nxt = t;
    curLen = nxtLen;
  }
}

/** ラティスを（節点, 始点からの経路長）の状態に展開したもの。tier 2/3 が経路長ごとに評価する */
export interface Expanded {
  readonly X: number;
  /** 状態 x の経路長 */
  readonly depth: Int32Array;
  /** 状態 x に入る辺 [inStart[x] .. inStart[x+1]) の前状態・文字コード・charMask ビット */
  readonly inStart: Int32Array;
  readonly inFrom: Int32Array;
  readonly inCh: Int32Array;
  readonly inBit: Int32Array;
  /** 終端の状態と経路長（経路長昇順） */
  readonly finals: readonly [x: number, m: number][];
}

const expandedCache = new WeakMap<Lattice, Expanded>();

/** 経路長で展開する（クエリごとに1回作りキャッシュ）。状態番号は位相順、始点は 0 */
export function expandByDepth(lat: Lattice): Expanded {
  const cached = expandedCache.get(lat);
  if (cached !== undefined) return cached;
  const V = lat.nodeCount;
  const depths: number[][] = Array.from({ length: V }, () => []);
  depths[0]!.push(0);
  for (let v = 0; v < V; v++) {
    for (let k = lat.outStart[v]!; k < lat.outStart[v + 1]!; k++) {
      const w = lat.to[lat.outEdges[k]!]!;
      for (const d of depths[v]!) if (!depths[w]!.includes(d + 1)) depths[w]!.push(d + 1);
    }
  }
  for (const ds of depths) ds.sort((a, b) => a - b);
  const base = new Int32Array(V + 1);
  for (let v = 0; v < V; v++) base[v + 1] = base[v]! + depths[v]!.length;
  const X = base[V]!;
  const xid = (v: number, d: number): number => base[v]! + depths[v]!.indexOf(d);
  const depth = new Int32Array(X);
  for (let v = 0; v < V; v++) for (const d of depths[v]!) depth[xid(v, d)] = d;
  const lists: [number, number, number][][] = Array.from({ length: X }, () => []);
  for (let e = 0; e < lat.from.length; e++) {
    const u = lat.from[e]!;
    const v = lat.to[e]!;
    for (const d of depths[u]!) lists[xid(v, d + 1)]!.push([xid(u, d), lat.ch[e]!.charCodeAt(0), lat.bit[e]!]);
  }
  const inStart = new Int32Array(X + 1);
  for (let x = 0; x < X; x++) inStart[x + 1] = inStart[x]! + lists[x]!.length;
  const total = inStart[X]!;
  const inFrom = new Int32Array(total);
  const inCh = new Int32Array(total);
  const inBit = new Int32Array(total);
  let p = 0;
  for (const list of lists) {
    for (const [y, c, b] of list) {
      inFrom[p] = y;
      inCh[p] = c;
      inBit[p++] = b;
    }
  }
  const finals = depths[lat.final]!.map((m) => [xid(lat.final, m), m] as [number, number]);
  const ex: Expanded = { X, depth, inStart, inFrom, inCh, inBit, finals };
  expandedCache.set(lat, ex);
  return ex;
}
