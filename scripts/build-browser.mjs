// ブラウザ直接利用向けの単一ファイル IIFE bundle (dist/yfuzzy.min.js) を生成する。
// npm run build から呼ばれ、パッケージに同梱して publish される (unpkg/jsdelivr フィールドの実体)。
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'yfuzzy',
  banner: {
    js: `/*! @ycookiey/yfuzzy v${version} | MIT | includes wanakana (MIT) | https://github.com/ycookiey/yfuzzy */`,
  },
  outfile: 'dist/yfuzzy.min.js',
});
