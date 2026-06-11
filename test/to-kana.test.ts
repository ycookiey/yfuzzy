import { describe, it, expect } from 'vitest';
import { toKana } from '../src/to-kana.js';

// 出力はひらがな（カタカナ化は normalize step5）。spec 2.2 / 8章。
describe('toKana (spec 2.2, vendored wanakana)', () => {
  it('訓令式・ヘボン式どちらも受理', () => {
    expect(toKana('si')).toBe('し');
    expect(toKana('shi')).toBe('し');
    expect(toKana('ti')).toBe('ち');
    expect(toKana('chi')).toBe('ち');
    expect(toKana('tu')).toBe('つ');
    expect(toKana('tsu')).toBe('つ');
    expect(toKana('zi')).toBe('じ');
    expect(toKana('ji')).toBe('じ');
    expect(toKana('hu')).toBe('ふ');
    expect(toKana('fu')).toBe('ふ');
  });

  it('末尾の単独 n は ん に確定（非IMEモード）', () => {
    expect(toKana('pokemon')).toBe('ぽけもん');
    expect(toKana('n')).toBe('ん');
    expect(toKana('nn')).toBe('んん');
  });

  it('促音（子音重ね）', () => {
    expect(toKana('kka')).toBe('っか');
    expect(toKana('budou')).toBe('ぶどう');
    expect(toKana('kitto')).toBe('きっと');
  });

  it('拗音・外来音', () => {
    expect(toKana('kya')).toBe('きゃ');
    expect(toKana('sha')).toBe('しゃ');
    expect(toKana('fa')).toBe('ふぁ');
    expect(toKana('di')).toBe('ぢ');
  });

  it('記号は無変換でリテラル維持（改変点1: wanakana の記号変換を除外）', () => {
    // wanakana 標準は batsuge-mu → ばつげーむ。yfuzzy では - をリテラル維持。
    expect(toKana('batsuge-mu')).toBe('ばつげ-む');
    expect(toKana('a/b')).toBe('あ/b');
    expect(toKana('a.b')).toBe('あ.b');
    expect(toKana('a,b')).toBe('あ,b');
    expect(toKana('a!')).toBe('あ!');
    expect(toKana('a?')).toBe('あ?');
    expect(toKana('a~')).toBe('あ~');
    expect(toKana('a_b')).toBe('あ_b');
  });

  it('変換できない英字（子音のみ等）はそのまま残す', () => {
    expect(toKana('msk')).toBe('msk');
    expect(toKana('pika')).toBe('ぴか');
    expect(toKana('spd')).toBe('spd');
  });

  it('大文字入力も小文字化して変換（カタカナ化はしない）', () => {
    expect(toKana('SI')).toBe('し');
    expect(toKana('Pokemon')).toBe('ぽけもん');
  });

  it('空文字', () => {
    expect(toKana('')).toBe('');
  });
});
