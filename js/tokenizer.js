/**
 * tokenizer.js — splits Czech text into word and non-word tokens.
 *
 * The naive /\w+/ breaks Czech badly: \w is ASCII-only, so "příběh" comes back
 * as three fragments ("p", "íb", "h") and every diacritic word is mangled. We
 * use the Unicode letter property instead, which Safari has supported since
 * iOS 11.3 and which correctly treats č š ž ř ů ě ý á í é ú ó as letters.
 *
 * Tokenizing is lossless: joining every token's text reproduces the input
 * exactly, so the reader can rebuild a sentence with punctuation and spacing
 * intact while making only the words tappable.
 */

// Letters, plus the apostrophe and hyphen when they sit *between* letters
// (so "česko-slovenský" stays one word but a dash on its own does not).
const WORD_RE = /\p{L}+(?:[-'’]\p{L}+)*/gu;

/**
 * @param {string} text
 * @returns {Array<{type:'word'|'gap', text:string}>}
 */
export function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  let last = 0;

  for (const match of text.matchAll(WORD_RE)) {
    if (match.index > last) {
      tokens.push({ type: 'gap', text: text.slice(last, match.index) });
    }
    tokens.push({ type: 'word', text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({ type: 'gap', text: text.slice(last) });
  }
  return tokens;
}

/** Just the words, in order, as they appear on the page. */
export function words(text) {
  return tokenize(text).filter((t) => t.type === 'word').map((t) => t.text);
}

/**
 * Normalise a surface form for dictionary lookup. Czech capitalises sentence
 * openings and proper nouns, but the dictionary is keyed lowercase.
 */
export function normalize(word) {
  return word.toLocaleLowerCase('cs-CZ');
}
