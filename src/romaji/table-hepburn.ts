// ヘボン式ローマ字テーブル（移植元: AnalyzerCH core-interface/search-normalize/romaji-hepburn.ts、
// ユーザー所有）。検索特化（shi/chi/tsu/fu/ji…）。

/** 単音カタカナ→ヘボン式（小書き単独も含む） */
export const SINGLE: Record<string, string> = {
  ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o',
  カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko',
  ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go',
  サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
  ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo',
  タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to',
  ダ: 'da', ヂ: 'di', ヅ: 'du', デ: 'de', ド: 'do',
  ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no',
  ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
  バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo',
  パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po',
  マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo',
  ヤ: 'ya', ユ: 'yu', ヨ: 'yo',
  ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro',
  ワ: 'wa', ヲ: 'wo', ン: 'n',
  ヴ: 'vu',
  ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o',
  ャ: 'ya', ュ: 'yu', ョ: 'yo',
};

/** 拗音・外来音ダイグラフ（先頭＋小書き） */
export const DIGRAPHS: Record<string, string> = {
  キャ: 'kya', キュ: 'kyu', キョ: 'kyo', キェ: 'kye',
  ギャ: 'gya', ギュ: 'gyu', ギョ: 'gyo',
  シャ: 'sha', シュ: 'shu', ショ: 'sho', シェ: 'she',
  ジャ: 'ja', ジュ: 'ju', ジョ: 'jo', ジェ: 'je',
  チャ: 'cha', チュ: 'chu', チョ: 'cho', チェ: 'che',
  ヂャ: 'dya', ヂュ: 'dyu', ヂョ: 'dyo',
  ニャ: 'nya', ニュ: 'nyu', ニョ: 'nyo',
  ヒャ: 'hya', ヒュ: 'hyu', ヒョ: 'hyo',
  ビャ: 'bya', ビュ: 'byu', ビョ: 'byo',
  ピャ: 'pya', ピュ: 'pyu', ピョ: 'pyo',
  ミャ: 'mya', ミュ: 'myu', ミョ: 'myo',
  リャ: 'rya', リュ: 'ryu', リョ: 'ryo',
  ファ: 'fa', フィ: 'fi', フェ: 'fe', フォ: 'fo',
  ヴァ: 'va', ヴィ: 'vi', ヴェ: 've', ヴォ: 'vo',
  ウィ: 'wi', ウェ: 'we', ウォ: 'wo',
  ティ: 'ti', トゥ: 'tu',
  ディ: 'di', ドゥ: 'du',
  ツァ: 'tsa', ツィ: 'tsi', ツェ: 'tse', ツォ: 'tso',
  イェ: 'ye',
};
