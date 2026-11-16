# Adding the next episode

Start a **new** Claude Code session. Select the `chtcarl/phrase-lab` repo and the cloud environment you made for this project (the one that allows YouTube, Fandom and github.io). Change `[S1 E2]` below to the episode you want, then paste the whole prompt.

Claude will find the official video and the Fandom transcripts, then ask you to paste the YouTube transcript. The cloud can't read YouTube captions itself, and it needs them for clip timing. To get them: open the video in Chrome, click **Show transcript** under the description, select all, copy, and paste it back.

---

Follow CLAUDE.md. Add Phineas and Ferb [S1 E2] to Phrase Lab.

Step 1: Find the sources yourself
- Find the official Disney upload of this episode on YouTube. It must be from a Disney channel, for example "Disney Channel Animation" or "Disney Channel". Confirm the channel with YouTube's oEmbed endpoint (https://www.youtube.com/oembed?url=…&format=json). Never use fan uploads.
- Find the Phineas and Ferb Wiki (Fandom) transcript page for each story in this episode, and read them with the Fandom API.
- Then STOP and send me: the YouTube link, the channel name, the story titles, and the Fandom pages. Ask me to paste the YouTube transcript.

Step 2: After I paste the YouTube transcript
Pick about 40–60 expressions yourself from the Fandom transcripts. I won't upload a slang guide.
- Choose slang, idioms, phrasal verbs and useful spoken forms that a fluent young reader would actually use, or would need in order to understand jokes and tone.
- Prioritize lines where tone changes the meaning (sarcasm, threats, teasing), twisted or compressed grammar, and running gags from earlier episodes.
- Skip lines that only work inside the plot, and skip plain vocabulary.
- Cover both stories, roughly in proportion to their length.
- Only pick lines you can match to playable dialogue in the YouTube transcript. List anything you had to drop in the episode notes.

Same format as S1E1: numbered phrases, plain-English steps for twisted or compressed lines, tone notes where tone changes the meaning, and 2–3 tone cards each. Keep it private: no real names anywhere.

Step 3: Finish
1. Run validate.py and check.js, both locally and on the live site.
2. Push to main.
3. Give me 5 clips to spot-check by ear (phrase number + what to listen for).
No screenshots needed.

---

## Tips
- Put all your fixes in one message, numbered.
- For small fixes, say "no full test needed".
- To fix one clip's timing, give the phrase number and how many seconds it's off, e.g. "#23 ends 1 s early".
