# Čeština — a mobile-first Czech reader

Read simple Czech stories, tap any word for its translation, pronunciation and
full grammar, save what you don't know, then practise it with flashcards and
printable worksheets. There is also a text adventure set in 14th-century Prague.

Built as a **PWA**: static files, no build step, no server, no accounts. Install
it to an iPhone home screen from Safari's Share menu and it works offline.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To try it on a phone on the same Wi-Fi, visit
`http://<your-computer's-LAN-IP>:8000`.

## Deploy to GitHub Pages

1. Push this directory to a GitHub repository.
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/`.
3. Wait a minute, then open `https://<username>.github.io/<repo>/`.

Every path in the app is relative, so it works at a domain root or in a
subdirectory. `.nojekyll` stops GitHub's Jekyll step from touching the files.

**After any change to a precached file, bump `CACHE` in `sw.js`.** Otherwise
returning visitors keep the old version from their cache.

## How the learning loop works

1. **Read.** Tap once to hear a word, twice for its details. Opening a word's
   details saves it as *Learning* (switchable in Settings), along with the
   sentence you met it in.
2. **Finish.** At the end of a story, mark the words still blue as *Known* —
   you read past them without needing help. This keeps every story's
   "% known" readout honest without tapping easy words one by one.
3. **Review.** Flashcards show each word in its sentence; English → Czech gaps
   it so you produce the right form. Grade *Again / Good / Easy*. Missed cards
   come back until you get them that session. Boxes reappear after 1, 2, 4, 8,
   16 and 32 days, and a pass from the top box graduates the word to *Known*.
4. **Repeat daily.** The home screen shows a streak and today's goal: finish a
   story, clear the due cards.

## Turn on Czech audio

Speech uses the device's own Czech voice. On iPhone:

> Settings → Accessibility → Spoken Content → Voices → Czech → **Zuzana**

Without it the app hides every speaker button rather than reading Czech in an
English accent, and the phonetic spelling does the work instead. Settings tells
you which state you're in.

## Layout

```
index.html            app shell
sw.js                 service worker: precaches everything for offline use
css/app.css           the design system
css/print.css         worksheets only, loaded with media="print"
js/                   one module per concern (see below)
data/dictionary.json  manifest listing the dictionary parts
data/dict/*.json      the dictionary itself, split for editability
data/stories/         index.json plus the stories, grouped by level
data/adventure/       the text adventure's node graph
tools/check.mjs       content integrity check
tools/smoke.sh        headless interaction tests
tests/smoke.html      the tests themselves (also openable in a browser)
```

### The modules

| File | Responsibility |
| --- | --- |
| `store.js` | The **only** module that touches localStorage. Word statuses, progress, settings, game state, export/import. |
| `dict.js` | Loads and merges the dictionary parts; resolves an inflected form to its lemma. |
| `tokenizer.js` | Unicode-aware splitting of Czech text (`\w` breaks on diacritics). |
| `tts.js` | Web Speech wrapper; detects whether a Czech voice exists at all. |
| `content.js` | Stories, levels, and the comprehension percentage. |
| `reader.js` | The story screen. |
| `wordpanel.js` | The word bottom sheet, shared by reader, saved list and adventure. |
| `home.js` `saved.js` `flashcards.js` `worksheets.js` `adventure.js` `settings.js` `placement.js` | One screen each. |
| `router.js` | Hash routing (GitHub Pages has no server-side rewrites). |
| `ui.js` | Element helper, icon set, toasts. |

## How the dictionary works

Czech inflects heavily — `vstává`, `vstávám` and `vstávej` are one word. Statuses
are therefore keyed by **lemma**, and the surface-form lookup index is **derived
at load time** from each entry's declension and conjugation tables. Write the
table and lookup follows automatically; the two can never drift apart.

An entry looks like this:

```json
"restaurace": {
  "translation": "restaurant",
  "phonetic": "RES-tau-ra-tse",
  "ipa": "rɛstau̯ratsɛ",
  "pos": "noun",
  "gender": "f",
  "forms": {
    "sg": { "nom": "restaurace", "gen": "restaurace", "dat": "restauraci", ... },
    "pl": { "nom": "restaurace", "gen": "restaurací", ... }
  },
  "extra": ["forms that belong to no table"]
}
```

Nouns and adjectives get seven cases in both numbers; verbs get present, past,
imperative and the aspect pair. When two lemmas claim the same surface form —
`je` is both "is" and "them" — the part loaded first wins, so `data/dictionary.json`
lists the commonest words first.

## Adding a story

1. Write `data/stories/<level>/NN-slug.json` with `id`, `title`, `level`,
   `grammarFocus` and `sentences` (each `{ "cs": …, "en": … }`).
2. Add it to `data/stories/index.json`.
3. Add any new words to a file under `data/dict/`.
4. Add the new files to `PRECACHE` in `sw.js` and bump `CACHE`.
5. Run the checks.

## Checks

```bash
node tools/check.mjs   # content integrity
./tools/smoke.sh       # interaction tests (needs Chrome)
```

`check.mjs` is the important guardrail: it fails if any word in any story or
adventure node is missing from the dictionary. A missing word would tap to
nothing — a silent dead end that gets worse as content grows. It also verifies
every adventure choice points at a node that exists, that no node is a dead end,
and that the story index matches the files.

## Backups

Saved words live in this browser only. Clearing Safari's website data erases
them. Settings → **Export backup** writes a JSON file — save it to iCloud Drive
and it survives a new phone. **Import backup** restores it.
