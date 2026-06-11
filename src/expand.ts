// separatorExpansion（spec 3章）。クエリを最大3経路に展開する。
// 展開は「追加」であって置換ではない。経路の順序は同点タイブレーク順（spec 5章）:
//   (c) リテラル経路（常設）> (a) 除去経路 > (b) 境界経路。
// データ側は展開しない（separator は 2.6 の境界として効く）。

/** separatorExpansion オプションの値（spec 3章 / design.md） */
export type SeparatorConfig = boolean | readonly string[];

/** true 指定時のデフォルト separator セット */
export const DEFAULT_SEPARATORS: readonly string[] = ['-', ' ', '・', '_'];

function resolveSeparators(config: SeparatorConfig): readonly string[] {
  if (config === false || config === undefined) return [];
  if (config === true) return DEFAULT_SEPARATORS;
  return config;
}

/** 文字を正規表現クラス用にエスケープ */
function escapeForCharClass(ch: string): string {
  return ch.replace(/[\\\]^-]/g, '\\$&');
}

/**
 * クエリ raw を展開経路へ。順序は (c) リテラル → (a) 除去 → (b) 境界。
 * - separator を含まない / 無効化時は [raw] のみ
 * - 末尾に separator がある場合は (a) 除去経路を生成しない（入力継続中シグナル、過剰マッチ回避）
 * - 重複・空文字列は除外（(c) は raw が空でも保持しない＝呼び出し側が空クエリ判定）
 */
export function expandQuery(raw: string, config: SeparatorConfig): string[] {
  const separators = resolveSeparators(config);
  if (separators.length === 0) return raw === '' ? [] : [raw];

  const klass = separators.map(escapeForCharClass).join('');
  const sepRe = new RegExp(`[${klass}]`, 'g');

  if (!sepRe.test(raw)) return raw === '' ? [] : [raw];

  const paths: string[] = [];
  const seen = new Set<string>();
  const push = (s: string): void => {
    if (s !== '' && !seen.has(s)) {
      seen.add(s);
      paths.push(s);
    }
  };

  // (c) リテラル
  push(raw);

  // (a) 除去（末尾 separator のときはスキップ）
  const lastCp = [...raw].at(-1)!;
  const endsWithSeparator = separators.includes(lastCp);
  if (!endsWithSeparator) {
    push(raw.replace(sepRe, ''));
  }

  // (b) 境界（separator → 単一スペース）
  push(raw.replace(sepRe, ' '));

  return paths;
}
