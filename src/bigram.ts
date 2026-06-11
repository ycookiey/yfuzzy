// bigram 集合生成（spec 2.3）。tier 4（構造類似層）の Tversky 類似度に使う。
// 先頭/末尾を ^ $ でパディングし、語頭・語末の一致を 2-gram として捕捉する。

const START = '^';
const END = '$';

/**
 * kana 文字列の文字 bigram 集合を生成する。
 * 例: 'カミ' → {'^カ', 'カミ', 'ミ$'}。空文字列は {'^$'}。
 */
export function generateBigrams(kana: string): Set<string> {
  const padded = START + kana + END;
  const set = new Set<string>();
  for (let i = 0; i + 1 < padded.length; i++) {
    set.add(padded.slice(i, i + 2));
  }
  return set;
}
