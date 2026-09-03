/**
 * adventure.js — the text adventure engine.
 *
 * A traditional RPG structure over a node graph: an inventory, flags for what
 * you have learned or done, and choices that only appear once you can make
 * them. The Czech prose uses the same tap-to-translate machinery as the reader,
 * so the game reinforces exactly the vocabulary the stories teach.
 */

import { el, icon, render, topbar, toast } from './ui.js';
import * as router from './router.js';
import * as dict from './dict.js';
import * as tts from './tts.js';
import * as wordpanel from './wordpanel.js';
import { makeWordTapHandler } from './wordtap.js';
import { tokenize, normalize } from './tokenizer.js';
import { getStatus, getGame, setGame } from './store.js';

const CHAPTER_FILE = 'data/adventure/karel-iv.json';

let chapter = null;

/**
 * Renders Czech text with tappable words, shared with the reader's approach:
 * a first tap speaks the word, a second tap on it opens the info panel.
 * @param {string} tag e.g. 'p.adv-scene' — choices need a span, since a <p>
 *                     inside a <button> is invalid HTML.
 * @param {(node:HTMLElement, surface:string) => void} onWordTap
 */
function czechText(text, tag, onWordTap) {
  const p = el(tag, { lang: 'cs' });

  for (const token of tokenize(text)) {
    if (token.type === 'gap') {
      p.append(token.text);
      continue;
    }
    const lemma = dict.lemmaOf(normalize(token.text));
    if (!lemma) {
      p.append(el('span.w', { 'data-unknown': 'true', text: token.text }));
      continue;
    }
    p.append(
      el('span.w', {
        role: 'button',
        tabindex: '0',
        'data-lemma': lemma,
        'data-status': String(getStatus(lemma)),
        text: token.text,
        on: {
          // Words inside a choice sit inside a <button>; stop the tap from
          // also firing that choice.
          click: (e) => {
            e.stopPropagation();
            onWordTap(e.currentTarget, token.text);
          },
          keydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onWordTap(e.currentTarget, token.text);
            }
          },
        },
      })
    );
  }
  return p;
}

function freshState() {
  return { chapter: 'karel-iv', node: chapter.start, flags: {}, items: [] };
}

/** Whether a choice's requirement is met by the current state. */
function available(choice, state) {
  if (choice.needItem && !state.items.includes(choice.needItem)) return false;
  if (choice.notItem && state.items.includes(choice.notItem)) return false;
  if (choice.needFlag && !state.flags[choice.needFlag]) return false;
  if (choice.notFlag && state.flags[choice.notFlag]) return false;
  return true;
}

export async function adventureScreen() {
  if (!chapter) {
    try {
      const res = await fetch(CHAPTER_FILE);
      if (!res.ok) throw new Error(`chapter returned ${res.status}`);
      chapter = await res.json();
    } catch (err) {
      console.error(err);
      toast('Could not load the adventure.');
      router.navigate('/', { replace: true });
      return;
    }
  }

  let state = getGame();
  if (!state || state.chapter !== chapter.id || !chapter.nodes[state.node]) {
    state = freshState();
  }

  let showEnglish = false;

  function go(choice) {
    if (choice.give && !state.items.includes(choice.give)) state.items.push(choice.give);
    if (choice.take) state.items = state.items.filter((i) => i !== choice.take);
    if (choice.set) Object.assign(state.flags, choice.set);
    state.node = choice.to;
    setGame(state);
    paint();
  }

  function restart() {
    if (!confirm('Start the adventure again from the beginning?')) return;
    state = freshState();
    setGame(state);
    paint();
  }

  function paint() {
    const node = chapter.nodes[state.node];
    if (!node) {
      state = freshState();
      setGame(state);
      return paint();
    }

    const repaintStatuses = (lemma, status) => {
      document.querySelectorAll(`.w[data-lemma="${CSS.escape(lemma)}"]`)
        .forEach((n) => { n.dataset.status = String(status); });
    };
    const onWordTap = makeWordTapHandler({ onChange: repaintStatuses });

    const scene = el('div');
    node.text.forEach((paragraph, i) => {
      scene.append(czechText(paragraph, 'p.adv-scene', onWordTap));
      if (showEnglish && node.en && node.en[i]) {
        scene.append(el('p.translation', { text: node.en[i] }));
      }
    });

    const choices = el('div');
    const usable = (node.choices || []).filter((c) => available(c, state));

    for (const choice of usable) {
      choices.append(
        el('button.choice', {
          on: { click: () => go(choice) },
        }, [
          czechText(choice.cs, 'span.choice-cs', onWordTap),
          showEnglish ? el('span.choice-en', { text: choice.en }) : null,
        ])
      );
    }

    if (node.ending) {
      choices.append(
        el('div.notice', {}, [
          el('p', { html: `<strong>${node.endingTitle || 'The end'}</strong>` }),
          el('p', { text: node.endingNote || '' }),
        ]),
        el('button.btn.btn--carmine.btn--block', {
          text: 'Play again',
          on: { click: restart },
        })
      );
    }

    const speakBtn = tts.isAvailable()
      ? el('button.icon-btn', {
          html: icon('speaker'),
          'aria-label': 'Read this scene aloud',
          on: { click: () => tts.speak(node.text.join(' ')) },
        })
      : null;

    render(
      el('div.screen', {}, [
        topbar(chapter.title, () => { tts.cancel(); router.navigate('/'); }, speakBtn),

        state.items.length
          ? el('div.inventory', {},
              state.items.map((item) => el('span.inv-item', { text: item, lang: 'cs' })))
          : null,

        node.place ? el('p.adv-place', { text: node.place }) : null,
        scene,
        choices,

        el('div.filter-row', { style: 'margin-top:26px' }, [
          el('button.chip', {
            'aria-pressed': String(showEnglish),
            text: showEnglish ? 'English shown' : 'Show English',
            on: { click: () => { showEnglish = !showEnglish; paint(); } },
          }),
          el('button.chip', { text: 'Restart', on: { click: restart } }),
        ]),
      ])
    );
  }

  await tts.init();
  paint();
}
