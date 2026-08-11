/**
 * reader.js — the story screen. The heart of the app.
 *
 * Renders Czech prose with every dictionary word tappable and colour-coded by
 * how well you know it, a sentence-translation toggle, and sentence-by-sentence
 * read-aloud.
 */

import { el, icon, render, topbar, toast } from './ui.js';
import * as router from './router.js';
import * as content from './content.js';
import * as dict from './dict.js';
import * as tts from './tts.js';
import * as wordpanel from './wordpanel.js';
import { tokenize, normalize } from './tokenizer.js';
import { getStatus, setProgress, getSettings, STATUS } from './store.js';

/** Live playback state, so leaving the screen can stop the audio. */
let playback = null;

function stopPlayback() {
  if (!playback) return;
  playback.cancelled = true;
  tts.cancel();
  document.querySelectorAll('.sentence.is-speaking')
    .forEach((n) => n.classList.remove('is-speaking'));
  playback = null;
}

/**
 * Build one sentence's DOM. Words present in the dictionary become buttons;
 * everything else (punctuation, spacing, unknown words) is inert text.
 */
function renderSentence(text, onWordTap) {
  const p = el('p.sentence', { lang: 'cs' });

  for (const token of tokenize(text)) {
    if (token.type === 'gap') {
      p.append(token.text);
      continue;
    }
    const lemma = dict.lemmaOf(normalize(token.text));
    if (!lemma) {
      // Not in the dictionary: render plainly so a tap that would do nothing
      // never looks tappable.
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
          click: (e) => onWordTap(e.currentTarget, token.text),
          keydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onWordTap(e.currentTarget, token.text);
            }
          },
        },
      })
    );
  }
  return p;
}

export async function readerScreen({ id }) {
  stopPlayback();
  await tts.init();

  const meta = content.storyMeta(id);
  if (!meta) {
    router.navigate('/', { replace: true });
    return;
  }
  const story = await content.loadStory(id);

  const settings = getSettings();
  // null means "follow the level default": on for A1/A2, off for B1 so you
  // attempt the Czech first.
  let showTranslations = settings.sentenceTranslations === null
    ? content.translationsDefaultOn(meta.level)
    : settings.sentenceTranslations;

  const body = el('div');
  const sentenceNodes = [];
  const translationNodes = [];

  function onWordTap(node, surface) {
    document.querySelectorAll('.w.is-active').forEach((n) => n.classList.remove('is-active'));
    node.classList.add('is-active');

    const opened = wordpanel.show(surface, {
      onChange: (lemma, status) => {
        // Repaint every occurrence of the word across the whole story, not just
        // the one tapped — the same word recurs and should update everywhere.
        body.querySelectorAll(`.w[data-lemma="${CSS.escape(lemma)}"]`)
          .forEach((n) => { n.dataset.status = String(status); });
      },
      onClose: () => node.classList.remove('is-active'),
    });
    if (!opened) node.classList.remove('is-active');
  }

  story.sentences.forEach((s, i) => {
    const node = renderSentence(s.cs, onWordTap);
    node.dataset.index = String(i);
    const translation = el('p.translation', { text: s.en, lang: 'en' });

    sentenceNodes.push(node);
    translationNodes.push(translation);
    body.append(node);
    if (showTranslations) body.append(translation);
  });

  function paintTranslations() {
    translationNodes.forEach((node, i) => {
      if (showTranslations) {
        if (!node.isConnected) sentenceNodes[i].after(node);
      } else if (node.isConnected) {
        node.remove();
      }
    });
  }

  /* --------------------------------------------------------- control bar */

  const translateBtn = el('button.toggle-chip', {
    'aria-pressed': String(showTranslations),
    html: `${icon('translate')}<span>Translation</span>`,
    on: {
      click: (e) => {
        showTranslations = !showTranslations;
        e.currentTarget.setAttribute('aria-pressed', String(showTranslations));
        paintTranslations();
      },
    },
  });

  const playBtn = el('button.play-btn', {
    html: icon('play', true),
    'aria-label': 'Read the story aloud',
  });

  function setPlayIcon(playing) {
    playBtn.innerHTML = icon(playing ? 'pause' : 'play', true);
    playBtn.setAttribute('aria-label', playing ? 'Stop reading' : 'Read the story aloud');
  }

  function speakFrom(index) {
    const session = { cancelled: false };
    playback = session;
    setPlayIcon(true);

    const step = (i) => {
      if (session.cancelled) return;
      if (i >= story.sentences.length) {
        stopPlayback();
        setPlayIcon(false);
        return;
      }
      sentenceNodes.forEach((n) => n.classList.remove('is-speaking'));
      const node = sentenceNodes[i];
      node.classList.add('is-speaking');
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setProgress(id, i);

      const started = tts.speak(story.sentences[i].cs, {
        onend: () => { if (!session.cancelled) step(i + 1); },
      });
      if (!started) {
        stopPlayback();
        setPlayIcon(false);
      }
    };
    step(index);
  }

  playBtn.addEventListener('click', () => {
    if (playback) {
      stopPlayback();
      setPlayIcon(false);
      return;
    }
    if (!tts.isAvailable()) {
      toast(tts.hasVoice()
        ? 'Audio is switched off in Settings.'
        : 'No Czech voice on this device — see Settings.');
      return;
    }
    speakFrom(0);
  });

  const bar = el('div.reader-bar', {}, [
    tts.isAvailable() ? playBtn : null,
    el('span.grow'),
    translateBtn,
  ]);

  /* Mark the story opened; furthest position is tracked as you play or scroll. */
  const progressed = story.sentences.length - 1;
  const seen = new WeakSet();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || seen.has(entry.target)) continue;
      seen.add(entry.target);
      setProgress(id, Math.min(Number(entry.target.dataset.index), progressed));
    }
  }, { rootMargin: '-40% 0px -40% 0px' });
  sentenceNodes.forEach((n) => observer.observe(n));

  render(
    el('div.screen.reader', {}, [
      topbar(meta.level, () => {
        stopPlayback();
        observer.disconnect();
        wordpanel.close();
        router.navigate('/');
      }),
      el('h1.reader-title', { text: story.title, lang: 'cs' }),
      el('p.reader-sub', {
        text: `${meta.level} · ${story.grammarFocus.join(' · ')}`,
      }),
      body,
      el('div.legend', {}, [
        el('span', { html: `<i data-status="0"></i> New` }),
        el('span', { html: `<i data-status="1"></i> Learning` }),
        el('span', { html: `<i data-status="2"></i> Known` }),
      ]),
    ]),
    bar
  );
}
