/**
 * tts.js — Czech speech via the Web Speech API.
 *
 * On iOS the voice list is populated asynchronously and is often empty on the
 * first synchronous call, so we wait for the voiceschanged event before
 * deciding whether Czech is available.
 *
 * A Czech voice is not guaranteed. On iPhone the user must download one under
 * Settings > Accessibility > Spoken Content > Voices > Czech (Zuzana). When no
 * Czech voice exists we report unavailable and the UI hides every speaker
 * button rather than reading Czech aloud in an English accent, which teaches
 * the wrong pronunciation. The phonetic spelling is always shown regardless.
 */

import { getSettings } from './store.js';

const LANG = 'cs-CZ';
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let voice = null;
let ready = null;
let current = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === LANG) ||
    voices.find((v) => v.lang && v.lang.replace('_', '-').startsWith('cs')) ||
    null
  );
}

/**
 * Resolves once we know whether a Czech voice exists.
 * @returns {Promise<SpeechSynthesisVoice|null>}
 */
export function init() {
  if (!supported) return Promise.resolve(null);
  if (ready) return ready;

  ready = new Promise((resolve) => {
    voice = pickVoice();
    if (voice) return resolve(voice);

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      voice = pickVoice();
      speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(voice);
    };
    speechSynthesis.addEventListener('voiceschanged', done);
    // Some engines never fire the event when the list is already final.
    setTimeout(done, 1200);
  });

  return ready;
}

/** True when Czech can actually be spoken AND the user has audio switched on. */
export function isAvailable() {
  return Boolean(supported && voice && getSettings().audio);
}

/** True when the device could speak Czech, regardless of the user's setting. */
export function hasVoice() {
  return Boolean(supported && voice);
}

export function voiceName() {
  return voice ? voice.name : null;
}

/**
 * Speak Czech text.
 * @param {string} text
 * @param {{rate?:number, onend?:Function, onstart?:Function}} [opts]
 * @returns {boolean} false when nothing was spoken
 */
export function speak(text, opts = {}) {
  if (!isAvailable() || !text) return false;

  cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.voice = voice;
  utter.lang = LANG;
  // The user's chosen pace (Settings); the default sits slightly under natural
  // speed because learners need to hear the word boundaries.
  utter.rate = opts.rate ?? getSettings().speechRate ?? 0.85;
  utter.pitch = 1;

  if (opts.onstart) utter.addEventListener('start', opts.onstart);

  // An utterance must settle exactly once. Engines keep a finished utterance in
  // their queue after firing 'end', so the cancel() at the top of the *next*
  // speak() also fires 'error: interrupted' on it. Without this guard the
  // caller's onend ran twice per sentence, and the reader — which chains
  // sentences from onend — spoke every sentence after the first one twice.
  let settled = false;

  utter.addEventListener('end', () => {
    if (settled) return;
    settled = true;
    current = null;
    if (opts.onend) opts.onend();
  });

  utter.addEventListener('error', (e) => {
    const deliberate = e.error === 'interrupted' || e.error === 'canceled';
    current = null;

    // A deliberate cancellation is never a completion: either it is the stale
    // event described above, or the user pressed stop. Continuing would restart
    // playback they just stopped.
    if (deliberate) {
      settled = true;
      return;
    }
    if (settled) return;
    settled = true;
    console.warn('Speech failed:', e.error);
    // A genuine failure still settles, so a caller chaining on onend cannot hang.
    if (opts.onend) opts.onend();
  });

  current = utter;
  speechSynthesis.speak(utter);
  return true;
}

export function cancel() {
  if (!supported) return;
  current = null;
  speechSynthesis.cancel();
}

export function isSpeaking() {
  return Boolean(supported && speechSynthesis.speaking);
}
