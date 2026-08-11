/**
 * store.js — the ONLY module that touches localStorage.
 *
 * Everything personal lives here: word statuses, reading progress, settings,
 * adventure state. No other module may read or write localStorage directly, so
 * that export/import and the storage schema have exactly one owner.
 *
 * Word status vocabulary (mirrors the LingQ colour scheme):
 *   0 = new       (never marked; highlighted blue in the reader)
 *   1 = learning  (actively studying; highlighted amber)
 *   2 = known     (no highlight; counts toward the difficulty readout)
 */

const KEYS = {
  words: 'czs.words',
  progress: 'czs.progress',
  settings: 'czs.settings',
  game: 'czs.game',
};

export const STATUS = { NEW: 0, LEARNING: 1, KNOWN: 2 };

const DEFAULT_SETTINGS = {
  audio: true,
  showPhonetics: true,
  theme: 'dark',
  // null means "follow the level default" (on for A1/A2, off for B1).
  sentenceTranslations: null,
  placementDone: false,
  suggestedLevel: null,
};

/** Leitner intervals in days, indexed by box number (1-5). */
export const LEITNER_DAYS = [null, 1, 2, 4, 8, 16];

const DAY_MS = 86400000;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    // A corrupted entry of the wrong shape is worse than no entry.
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // Private browsing or a full quota. The app stays usable in-memory for the
    // session; we surface it rather than failing silently on a save button.
    console.warn(`Could not persist ${key}:`, err);
    return false;
  }
}

/* ---------------------------------------------------------------- words --- */

/** @returns {Record<string, {status:number, added:number, box:number, due:number}>} */
export function allWords() {
  return read(KEYS.words, {});
}

export function getWord(lemma) {
  return allWords()[lemma] || null;
}

export function getStatus(lemma) {
  const w = allWords()[lemma];
  return w ? w.status : STATUS.NEW;
}

/**
 * Set a word's status, creating the record on first touch.
 * Promoting to KNOWN retires it from flashcard review; demoting back to
 * LEARNING puts it in box 1 so it comes round again promptly.
 */
export function setStatus(lemma, status) {
  const words = allWords();
  const now = Date.now();
  const existing = words[lemma];

  if (!existing) {
    words[lemma] = { status, added: now, box: 1, due: now };
  } else {
    const wasKnown = existing.status === STATUS.KNOWN;
    existing.status = status;
    if (status === STATUS.KNOWN) {
      existing.box = LEITNER_DAYS.length - 1;
    } else if (wasKnown) {
      existing.box = 1;
      existing.due = now;
    }
  }
  write(KEYS.words, words);
  return words[lemma];
}

export function removeWord(lemma) {
  const words = allWords();
  delete words[lemma];
  write(KEYS.words, words);
}

/** Words eligible for flashcard review: not yet known, and due. */
export function dueWords(now = Date.now()) {
  const words = allWords();
  return Object.keys(words)
    .filter((k) => words[k].status !== STATUS.KNOWN && (words[k].due || 0) <= now)
    .sort((a, b) => (words[a].due || 0) - (words[b].due || 0));
}

/** Saved words that are not yet due, with the soonest due time first. */
export function upcomingWords(now = Date.now()) {
  const words = allWords();
  return Object.keys(words)
    .filter((k) => words[k].status !== STATUS.KNOWN && (words[k].due || 0) > now)
    .sort((a, b) => (words[a].due || 0) - (words[b].due || 0));
}

/**
 * Record a flashcard answer. Correct promotes one box (capped), incorrect drops
 * straight back to box 1 — the standard Leitner rule, which deliberately makes
 * forgetting expensive so the word returns tomorrow.
 */
export function reviewWord(lemma, correct, now = Date.now()) {
  const words = allWords();
  const w = words[lemma];
  if (!w) return null;

  const maxBox = LEITNER_DAYS.length - 1;
  w.box = correct ? Math.min((w.box || 1) + 1, maxBox) : 1;
  w.due = now + LEITNER_DAYS[w.box] * DAY_MS;
  if (correct && w.status === STATUS.NEW) w.status = STATUS.LEARNING;

  write(KEYS.words, words);
  return w;
}

/* ------------------------------------------------------------- progress --- */

export function allProgress() {
  return read(KEYS.progress, {});
}

export function getProgress(storyId) {
  return allProgress()[storyId] || null;
}

export function setProgress(storyId, lastSentence) {
  const progress = allProgress();
  const prev = progress[storyId] || {};
  progress[storyId] = {
    ...prev,
    lastSentence,
    opened: Date.now(),
    // Furthest point ever reached, so re-reading never rewinds the progress ring.
    furthest: Math.max(prev.furthest || 0, lastSentence),
  };
  write(KEYS.progress, progress);
}

/* ------------------------------------------------------------- settings --- */

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function setSetting(key, value) {
  const settings = getSettings();
  settings[key] = value;
  write(KEYS.settings, settings);
  return settings;
}

/* ----------------------------------------------------------------- game --- */

export function getGame() {
  return read(KEYS.game, null);
}

export function setGame(state) {
  write(KEYS.game, state);
}

/* -------------------------------------------------------- export/import --- */

const EXPORT_VERSION = 1;

/** Everything the user owns, as a plain object ready to be serialised. */
export function exportAll() {
  return {
    app: 'czstoryapp',
    version: EXPORT_VERSION,
    exported: new Date().toISOString(),
    words: allWords(),
    progress: allProgress(),
    settings: getSettings(),
    game: getGame(),
  };
}

/**
 * Restore a backup. Validates shape before writing anything, so a malformed
 * file can never leave storage half-overwritten.
 * @returns {{ok:true, counts:object}|{ok:false, error:string}}
 */
export function importAll(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (data.app !== 'czstoryapp') {
    return { ok: false, error: 'That backup was not created by this app.' };
  }
  if (!data.words || typeof data.words !== 'object') {
    return { ok: false, error: 'The backup is missing its word list.' };
  }

  for (const [lemma, w] of Object.entries(data.words)) {
    if (!w || typeof w.status !== 'number' || w.status < 0 || w.status > 2) {
      return { ok: false, error: `The saved word "${lemma}" is malformed.` };
    }
  }

  write(KEYS.words, data.words);
  if (data.progress && typeof data.progress === 'object') write(KEYS.progress, data.progress);
  if (data.settings && typeof data.settings === 'object') write(KEYS.settings, data.settings);
  if (data.game && typeof data.game === 'object') write(KEYS.game, data.game);

  return {
    ok: true,
    counts: {
      words: Object.keys(data.words).length,
      stories: Object.keys(data.progress || {}).length,
    },
  };
}

/** Wipe everything. Callers are responsible for confirming with the user. */
export function resetAll() {
  Object.values(KEYS).forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* nothing useful to do */ }
  });
}
