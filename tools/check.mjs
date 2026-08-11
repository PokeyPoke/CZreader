/**
 * check.mjs — content integrity check. Run with: node tools/check.mjs
 *
 * The guardrail that keeps the reader honest. If a word appears in a story or
 * in the adventure but is missing from dictionary.json, tapping it would do
 * nothing — a silent dead end that gets worse as content grows. This fails the
 * check instead.
 *
 * Also verifies that every adventure choice points at a node that exists, so a
 * typo in a node id cannot strand the player.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, normalize } from '../js/tokenizer.js';
import { buildIndex, surfaceFormsOf } from '../js/dict.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'));

const problems = [];
const warn = [];

const manifest = await read('data/dictionary.json');
const lemmas = {};
for (const file of manifest.parts) {
  const part = await read(file);
  for (const key of Object.keys(part.lemmas)) {
    if (lemmas[key]) problems.push(`dictionary: "${key}" is defined twice (${file})`);
  }
  Object.assign(lemmas, part.lemmas);
}

const { index: formIndex, collisions } = buildIndex(lemmas);
collisions.forEach((c) => warn.push(`dictionary: ${c}`));

const lemmaSet = new Set(Object.keys(lemmas));
const formSet = new Set(Object.keys(formIndex));

function resolve(word) {
  return formSet.has(normalize(word));
}

/** Every word of a Czech string that the dictionary cannot resolve. */
function missing(text, where) {
  for (const t of tokenize(text)) {
    if (t.type !== 'word') continue;
    if (!resolve(t.text)) problems.push(`${where}: "${t.text}" is not in the dictionary`);
  }
}

/* ------------------------------------------------------------ dictionary --- */

const POS = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'numeral',
  'preposition', 'conjunction', 'particle', 'name', 'interjection'];

for (const [lemma, entry] of Object.entries(lemmas)) {
  if (!entry.translation) problems.push(`dictionary: ${lemma} has no translation`);
  if (!entry.pos) problems.push(`dictionary: ${lemma} has no part of speech`);
  else if (!POS.includes(entry.pos)) {
    problems.push(`dictionary: ${lemma} has unknown part of speech "${entry.pos}"`);
  }
  if (!entry.phonetic) warn.push(`dictionary: ${lemma} has no phonetic spelling`);
  if (lemma !== normalize(lemma)) {
    problems.push(`dictionary: lemma "${lemma}" must be lowercase`);
  }
  if (entry.pos === 'noun' && !entry.gender) {
    warn.push(`dictionary: noun ${lemma} has no gender`);
  }
  // A noun or verb with no tables gives the word panel nothing to show.
  if (['noun', 'verb', 'adjective'].includes(entry.pos) && !entry.forms) {
    warn.push(`dictionary: ${entry.pos} ${lemma} has no form tables`);
  }
  for (const form of surfaceFormsOf(entry)) {
    if (form !== normalize(form) && form !== form.trim()) {
      problems.push(`dictionary: form "${form}" of ${lemma} has stray whitespace`);
    }
  }
}

/* ---------------------------------------------------------------- stories --- */

const catalog = await read('data/stories/index.json');
const seenIds = new Set();

for (const meta of catalog) {
  if (seenIds.has(meta.id)) problems.push(`index: duplicate story id "${meta.id}"`);
  seenIds.add(meta.id);

  let story;
  try {
    story = await read(meta.file);
  } catch (err) {
    problems.push(`index: cannot read ${meta.file} (${err.message})`);
    continue;
  }

  if (story.id !== meta.id) problems.push(`${meta.file}: id does not match the index`);
  if (story.sentences.length !== meta.sentences) {
    problems.push(
      `${meta.file}: index says ${meta.sentences} sentences, file has ${story.sentences.length}`
    );
  }

  story.sentences.forEach((s, i) => {
    if (!s.en) problems.push(`${meta.id} sentence ${i + 1}: missing English`);
    missing(s.cs, `${meta.id} sentence ${i + 1}`);
  });
}

/* Any story file not listed in the index would be invisible in the app. */
for (const level of ['a1', 'a2', 'b1']) {
  const dir = `data/stories/${level}`;
  let files;
  try {
    files = await readdir(join(root, dir));
  } catch {
    continue;
  }
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const path = `${dir}/${f}`;
    if (!catalog.some((m) => m.file === path)) {
      problems.push(`${path} exists but is not listed in data/stories/index.json`);
    }
  }
}

/* -------------------------------------------------------------- adventure --- */

const chapter = await read('data/adventure/karel-iv.json');
const nodeIds = new Set(Object.keys(chapter.nodes));

if (!nodeIds.has(chapter.start)) {
  problems.push(`adventure: start node "${chapter.start}" does not exist`);
}

const reachable = new Set([chapter.start]);
const queue = [chapter.start];
while (queue.length) {
  const id = queue.shift();
  for (const choice of chapter.nodes[id]?.choices || []) {
    if (!nodeIds.has(choice.to)) {
      problems.push(`adventure: node "${id}" points at missing node "${choice.to}"`);
      continue;
    }
    if (!reachable.has(choice.to)) {
      reachable.add(choice.to);
      queue.push(choice.to);
    }
  }
}

for (const [id, node] of Object.entries(chapter.nodes)) {
  if (!reachable.has(id)) warn.push(`adventure: node "${id}" is unreachable`);
  if (!node.ending && !(node.choices || []).length) {
    problems.push(`adventure: node "${id}" is a dead end with no choices and no ending`);
  }
  (node.text || []).forEach((p, i) => missing(p, `adventure ${id} paragraph ${i + 1}`));
  (node.choices || []).forEach((c, i) => {
    missing(c.cs, `adventure ${id} choice ${i + 1}`);
    if (!c.en) problems.push(`adventure: node "${id}" choice ${i + 1} has no English`);
  });
  if (node.en && node.en.length !== node.text.length) {
    problems.push(`adventure: node "${id}" has ${node.en.length} translations for ${node.text.length} paragraphs`);
  }
}

/* -------------------------------------------------------------- placement --- */

const placement = await read('data/placement.json');
for (const item of placement) {
  if (!lemmaSet.has(item.lemma)) {
    problems.push(`placement: "${item.lemma}" is not a dictionary lemma`);
  }
  if (!['A1', 'A2', 'B1'].includes(item.level)) {
    problems.push(`placement: "${item.lemma}" has an invalid level "${item.level}"`);
  }
}

/* ----------------------------------------------------------------- report --- */

const uniqueWarn = [...new Set(warn)];
const uniqueProblems = [...new Set(problems)];

if (uniqueWarn.length) {
  console.log(`\n${uniqueWarn.length} warning(s):`);
  uniqueWarn.slice(0, 40).forEach((w) => console.log('  ~ ' + w));
  if (uniqueWarn.length > 40) console.log(`  … and ${uniqueWarn.length - 40} more`);
}

if (uniqueProblems.length) {
  console.log(`\n${uniqueProblems.length} problem(s):`);
  uniqueProblems.slice(0, 60).forEach((p) => console.log('  ✗ ' + p));
  if (uniqueProblems.length > 60) console.log(`  … and ${uniqueProblems.length - 60} more`);
  console.log('');
  process.exit(1);
}

console.log(`\n✓ ${lemmaSet.size} lemmas, ${formSet.size} forms indexed`);
console.log(`✓ ${catalog.length} stories, all words resolve`);
console.log(`✓ adventure: ${nodeIds.size} nodes, all reachable and connected`);
console.log(`✓ placement: ${placement.length} words\n`);
