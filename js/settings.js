/**
 * settings.js — preferences, backup, and the honest report on Czech audio.
 */

import { el, render, topbar, toast, icon } from './ui.js';
import * as router from './router.js';
import * as tts from './tts.js';
import {
  getSettings, setSetting, exportAll, importAll, resetAll, allWords,
} from './store.js';

function toggle(label, desc, key, value, onChange, disabled = false) {
  const sw = el('button.switch', {
    role: 'switch',
    'aria-checked': String(value),
    'aria-label': label,
    disabled: disabled || null,
    on: {
      click: (e) => {
        const next = e.currentTarget.getAttribute('aria-checked') !== 'true';
        e.currentTarget.setAttribute('aria-checked', String(next));
        onChange(next);
      },
    },
  });
  return el('div.setting', {}, [
    el('div.setting-main', {}, [
      el('div.setting-label', { text: label }),
      el('div.setting-desc', { text: desc }),
    ]),
    sw,
  ]);
}

function downloadBackup() {
  const data = exportAll();
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = el('a', { href: url, download: `czech-words-${stamp}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download on iOS; give it a moment.
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  toast(`Exported ${Object.keys(data.words).length} words`);
}

function pickBackup(onDone) {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        toast('That file is not valid JSON.');
        return;
      }
      const result = importAll(parsed);
      if (!result.ok) {
        toast(result.error);
        return;
      }
      toast(`Restored ${result.counts.words} words`);
      onDone();
    };
    reader.onerror = () => toast('Could not read that file.');
    reader.readAsText(file);
  });
  input.click();
}

export async function settingsScreen() {
  await tts.init();
  const settings = getSettings();
  const wordCount = Object.keys(allWords()).length;

  const audioNotice = tts.hasVoice()
    ? el('div.notice', {}, [
        el('p', {
          html: `<strong>Czech voice found:</strong> ${tts.voiceName()}. Words and stories can be read aloud.`,
        }),
      ])
    : el('div.notice.notice--error', {}, [
        el('p', { html: '<strong>No Czech voice on this device.</strong>' }),
        el('p', {
          text: 'On iPhone: Settings → Accessibility → Spoken Content → Voices → Czech → download Zuzana, then reopen this app. Until then, audio buttons stay hidden and the phonetic spelling does the work.',
        }),
      ]);

  render(
    el('div.screen', {}, [
      topbar('Settings', () => router.navigate('/')),

      el('p.section-head', { text: 'Reading' }),

      audioNotice,

      toggle(
        'Speak words aloud',
        tts.hasVoice()
          ? 'Show the speaker buttons and read stories aloud.'
          : 'Unavailable until a Czech voice is installed on this device.',
        'audio',
        settings.audio && tts.hasVoice(),
        (v) => setSetting('audio', v),
        !tts.hasVoice()
      ),

      toggle(
        'Show phonetic spelling',
        'Display the pronunciation guide and IPA in the word panel.',
        'showPhonetics',
        settings.showPhonetics,
        (v) => setSetting('showPhonetics', v)
      ),

      el('div.setting', {}, [
        el('div.setting-main', {}, [
          el('div.setting-label', { text: 'Sentence translations' }),
          el('div.setting-desc', {
            text: 'By default these follow the level: on for A1 and A2, off for B1 so you attempt the Czech first. You can always toggle them inside a story.',
          }),
        ]),
      ]),
      el('div.filter-row', {}, [
        ...[
          [null, 'Follow level'],
          [true, 'Always on'],
          [false, 'Always off'],
        ].map(([value, label]) =>
          el('button.chip', {
            'aria-pressed': settings.sentenceTranslations === value ? 'true' : 'false',
            text: label,
            on: {
              click: () => { setSetting('sentenceTranslations', value); settingsScreen(); },
            },
          })
        ),
      ]),

      toggle(
        'Light theme',
        'Aged paper instead of dark ink.',
        'theme',
        settings.theme === 'light',
        (v) => {
          const theme = v ? 'light' : 'dark';
          setSetting('theme', theme);
          document.documentElement.dataset.theme = theme;
        }
      ),

      el('p.section-head', { text: 'Level' }),
      el('div.setting', {}, [
        el('div.setting-main', {}, [
          el('div.setting-label', { text: 'Placement check' }),
          el('div.setting-desc', {
            text: settings.placementDone
              ? `Last result suggested ${settings.suggestedLevel || 'A1'}. Run it again any time — nothing is ever locked, so this is only a suggestion.`
              : 'A quick 40-word check that suggests a starting level and seeds your word list.',
          }),
        ]),
      ]),
      el('button.btn.btn--ghost.btn--block', {
        text: settings.placementDone ? 'Run the check again' : 'Take the placement check',
        on: { click: () => router.navigate('/placement') },
      }),

      el('p.section-head', { text: 'Backup' }),
      el('div.notice', {}, [
        el('p', {
          html: `Your <strong>${wordCount} saved words</strong> live only on this device. Clearing Safari's website data would erase them, so export a backup now and then — save it to iCloud Drive and it survives a new phone.`,
        }),
      ]),
      el('div.tile-row', {}, [
        el('button.btn.btn--ghost', { text: 'Export backup', on: { click: downloadBackup } }),
        el('button.btn.btn--ghost', {
          text: 'Import backup',
          on: { click: () => pickBackup(() => settingsScreen()) },
        }),
      ]),

      el('p.section-head', { text: 'Danger' }),
      el('button.btn.btn--ghost.btn--block', {
        text: 'Erase all my data',
        style: 'color:var(--carmine);border-color:var(--carmine)',
        on: {
          click: () => {
            if (!confirm('Erase every saved word, all progress and settings? This cannot be undone. Export a backup first if you are not sure.')) return;
            resetAll();
            toast('Everything erased.');
            router.navigate('/');
          },
        },
      }),

      el('p.setting-desc', {
        style: 'margin:28px 0 8px;text-align:center',
        text: 'Add to Home Screen from the Share menu for a full-screen app that works offline.',
      }),
    ])
  );
}
