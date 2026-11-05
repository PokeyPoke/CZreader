/**
 * wordtap.js — the two-step tap gesture shared by the reader and the
 * adventure: first tap speaks the word, second tap (on the same,
 * still-pending word) opens the info panel.
 *
 * When no Czech voice is available there is nothing to play, so a single tap
 * opens the panel directly — a dead first tap would just be confusing.
 */

import * as tts from './tts.js';
import * as wordpanel from './wordpanel.js';

/**
 * @param {object} [opts]
 * @param {(lemma:string, status:number) => void} [opts.onChange] forwarded to
 *   wordpanel.show, so callers can repaint every occurrence of a word
 * @param {() => void} [opts.onBeforeSpeak] called just before the first tap
 *   speaks — e.g. so the reader can stop whole-story playback first
 * @param {(node:HTMLElement) => ({cs:string,en:string}|null)} [opts.contextOf]
 *   the sentence a tapped word sits in, remembered for flashcards
 * @returns {(node:HTMLElement, surface:string) => void} a click/keydown handler
 */
export function makeWordTapHandler({ onChange, onBeforeSpeak, contextOf } = {}) {
  let pending = null;

  function clearPending() {
    if (pending) pending.classList.remove('is-pending');
    pending = null;
  }

  function openPanel(node, surface) {
    clearPending();
    document.querySelectorAll('.w.is-active').forEach((n) => n.classList.remove('is-active'));
    node.classList.add('is-active');

    const ctx = contextOf ? contextOf(node) : null;
    const opened = wordpanel.show(surface, {
      onChange,
      context: ctx ? { ...ctx, surface } : null,
      onClose: () => node.classList.remove('is-active'),
    });
    if (!opened) node.classList.remove('is-active');
  }

  return function onWordTap(node, surface) {
    // No audio to play first, so there is nothing a first tap would achieve.
    if (!tts.isAvailable()) {
      openPanel(node, surface);
      return;
    }

    // Second tap on the word already awaiting one: show its details.
    if (pending === node) {
      openPanel(node, surface);
      return;
    }

    if (onBeforeSpeak) onBeforeSpeak();
    clearPending();
    pending = node;
    node.classList.add('is-pending');
    tts.speak(surface);
  };
}
