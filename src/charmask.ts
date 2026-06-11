// 文字集合ビットマスク（前置フィルタ用）。各文字を 31bit のいずれかへハッシュする。
// 健全性: ハッシュ衝突は「存在すると誤認」方向にしか働かないため、
//   subsequence/編集距離の「不一致で即棄却」判定で誤棄却（false negative）を起こさない。
// 衝突時は棄却せず本判定（DP）へ落ちるだけなので結果は不変。

/** 文字列の文字集合を 31bit マスクへ（bit 0..30、符号ビット回避） */
export function charMask(s: string): number {
  let m = 0;
  for (let i = 0; i < s.length; i++) {
    m |= 1 << (s.charCodeAt(i) % 31);
  }
  return m;
}

/** 立っているビット数（≤31bit 前提の素朴実装） */
export function popcount(x: number): number {
  let c = 0;
  let v = x;
  while (v !== 0) {
    v &= v - 1;
    c++;
  }
  return c;
}
