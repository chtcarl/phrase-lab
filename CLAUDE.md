# Phrase Lab: notes for Claude

A static site (GitHub Pages) for an English tutor and a child learner. They watch an official YouTube episode clip by clip and learn its slang, idioms and useful spoken forms. Live at https://chtcarl.github.io/phrase-lab/.

## Structure
- `index.html`, `styles.css`, `app.js`: the app. No build step, no framework.
- `episodes/index.json`: list of episodes (`id`, `file`, `label`, `title`).
- `episodes/<id>.json`: one lesson file per episode. Adding an episode should only need a new JSON file plus an entry in `episodes/index.json`.
- `tests/`: `validate.py` checks a lesson file. `check.js` drives the site in Playwright with a fake YouTube player.

## Rules
- **Privacy:** never put the child's or the tutor's real name anywhere: site, lesson content, commit messages, README. Say "the student", "you", or "your teacher".
- **Cache:** after changing `app.js` or `styles.css`, bump `?v=N` on both links in `index.html`.
- Keep `app.js` robust: an element that is missing must not stop the lesson rendering. Use the `on()` helper and null checks.
- American spelling in lesson text. Keep sentences short and kid-friendly. The learner reads fluently and handles nuance.
- Commit and push to `main`. Pages deploys in about 30–60 s.

## Lesson file format (`episodes/<id>.json`)
Top level: `id`, `show`, `label` (e.g. "S1 E2"), `videoId`, `videoTitle`, `clipPadding` `{ "start": 0.5, "end": 1.0 }`, `sources[]`, `stories[]` (`id`, `title`, `range`), `notes[]` (shown to the teacher), `expressions[]`.

Each expression:
- `n`: number 1..N in order of first clip start. Numbers are what the progress code uses, so never renumber an episode once it's in use. Add new items at the end instead.
- `id`: kebab-case, unique.
- `story`: a story id.
- `type`: e.g. Slang, Idiom, Phrasal verb, Spoken form, Useful phrase, "Tone changes meaning", British English, "Slang (Sung)".
- `phrase`: the display title.
- `clips[]`: `{ label?, start "m:ss", end "m:ss", lines [[speaker, text]], hl }`. `hl` must be an exact (case-insensitive) substring of one line. A second clip is only for a meaningfully different delivery or scene.
- `plain` (optional): a string, or an array of steps, for "Say it normally". Use it when the line is compressed, twisted or back-to-front.
- `meaning`, `tone` (optional; use it when tone changes the meaning), `listen` (optional), `example` (an original sentence the child could say), `practice` (a new situation prompt).
- `toneCards[]`: 2–3 cards `{ emoji, tone, situation, note? }`. Each one is a short situation where the child says the phrase in that tone. At least one should contrast with the others (real vs sarcastic, playful vs serious, polite vs rude).

## Timing (learned the hard way)
- Get timing from the YouTube transcript the user pastes (the "Show transcript" text with m:ss stamps). The cloud container cannot fetch YouTube captions or play the video, because YouTube blocks it.
- Get wording and speakers from the Fandom transcript via the API: `https://<wiki>.fandom.com/api.php?action=parse&page=<Page>/Transcript&prop=wikitext&format=json`. Plain page fetches hit Cloudflare.
- Captions are ALL CAPS chunks, and they run ahead of the audio. Set `start` about 1 s before the setup line and `end` at the next caption chunk's start. `clipPadding` adds 0.5 s before and 1 s after; the user confirmed 1 s at the end is right.
- Correct caption errors using Fandom, and list the fixes in `notes`.
- Claude cannot hear the audio. Ask the user to spot-check 3–5 clips after each new episode.

## Verify before handing over
1. `python3 tests/validate.py episodes/<id>.json`
2. Serve the repo (`python3 -m http.server 8766`), then run `node tests/check.js http://localhost:8766/ <id>`. It uses the fake player in `tests/fakeyt.js` and checks that every phrase seeks to the right start, the highlight shows, the clip stops at the end, and loop and replay work.
3. After pushing, run the same check against the live URL.
Skip screenshots unless the layout changed.
