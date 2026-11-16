# Phrase Lab

A static site that plays short clips from the official YouTube upload of an episode and teaches the phrases in them.

- `index.html`, `styles.css`, `app.js`: the app. You don't need to edit these to add an episode.
- `episodes/index.json`: the list of episodes.
- `episodes/<id>.json`: one lesson file per episode, with the video ID, the stories, and the expressions. Each expression has clips (start/end as m:ss, the lines, and the highlight), plus meaning, tone, listen, example and practice.

To add an episode, write `episodes/s1e2.json` in the same shape and add it to `episodes/index.json`.
Links to a single phrase look like `#s1e1/see-your-point`.

See `NEXT_EPISODE.md` for how to add an episode, and `CLAUDE.md` for the full format and rules.
Checks: `python3 tests/validate.py episodes/s1e1.json` and `node tests/check.js http://localhost:8766/ s1e1`.
