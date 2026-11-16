/* Phrase Lab — episode-agnostic app. Lesson content lives in episodes/*.json. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toSec = (t) => {
    if (typeof t === "number") return t;
    const parts = String(t).split(":").map(Number);
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  };
  const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); const r = Math.floor(s % 60); return m + ":" + String(r).padStart(2, "0"); };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return localStorage.getItem(k) === v; } catch (e) { return false; } },
  };

  const state = {
    episodes: [], ep: null, items: [], storyFilter: "all", query: "",
    current: null, clipIdx: 0, mode: "learn",
    loop: false, rate: 1,
    clip: null, clipActive: false, ticker: null,
    practice: { deck: [], i: 0, kind: "hear", revealed: false, phraseShown: false },
    progress: { done: {}, star: {} }, hideDone: false, toneId: null, toneAll: false,
  };

  /* ---------------- Player ---------------- */
  let player = null, playerReady = false, pending = null;

  window.onYouTubeIframeAPIReady = function () {
    if (!state.ep) { pending = pending || { initOnly: true }; return; }
    createPlayer();
  };

  function createPlayer() {
    if (player || !window.YT || !YT.Player) return;
    player = new YT.Player("player", {
      videoId: state.ep.videoId,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1, cc_load_policy: 0, iv_load_policy: 3, origin: location.origin },
      events: {
        onReady: () => {
          playerReady = true;
          if (pending && pending.clip) { const c = pending.clip; pending = null; playClip(c); }
          else cueClip(state.clip);
        },
        onStateChange: () => updateStatus(),
      },
    });
  }

  function cueClip(clip) {
    if (!clip || !playerReady) return;
    try { player.cueVideoById({ videoId: state.ep.videoId, startSeconds: clip.s }); } catch (e) { /* ignore */ }
  }

  function playClip(clip) {
    state.clip = clip;
    state.clipActive = true;
    if (!playerReady) { pending = { clip }; setStatus("Loading player…"); return; }
    player.setPlaybackRate(state.rate);
    player.seekTo(clip.s, true);
    player.playVideo();
    startTicker();
  }

  function startTicker() {
    clearInterval(state.ticker);
    state.ticker = setInterval(tick, 100);
  }

  function tick() {
    if (!playerReady || !state.clip) return;
    const t = player.getCurrentTime();
    const st = player.getPlayerState();
    const { s, e } = state.clip;
    if (state.clipActive && (t < s - 2 || t > e + 3)) { state.clipActive = false; } // viewer scrubbed away: stop managing
    if (state.clipActive && st === YT.PlayerState.PLAYING && t >= e) {
      if (state.loop) { player.seekTo(s, true); window.__lab.loops++; }
      else { player.pauseVideo(); state.clipActive = false; window.__lab.ends++; }
    }
    updateStatus(t);
  }

  function updateStatus(t) {
    if (!state.clip) return setStatus("");
    if (t == null && playerReady) t = player.getCurrentTime();
    const span = fmt(state.clip.s) + "–" + fmt(state.clip.e);
    let label = "Clip " + span;
    if (playerReady && player.getPlayerState() === YT.PlayerState.PLAYING && state.clipActive) label = "Playing " + fmt(t) + " · clip " + span;
    if (state.loop) label += " · looping";
    setStatus(label);
  }
  function setStatus(s) { $("#clip-status").textContent = s; }

  /* ---------------- Data ---------------- */
  async function loadIndex() {
    const res = await fetch("episodes/index.json", { cache: "no-cache" });
    const idx = await res.json();
    state.episodes = idx.episodes;
    const sel = $("#episode-select");
    sel.innerHTML = state.episodes.map((e) => `<option value="${esc(e.id)}">${esc(e.label + " · " + e.title)}</option>`).join("");
    sel.hidden = state.episodes.length < 2;
    const fromHash = parseHash();
    const startId = (fromHash.ep && state.episodes.some((e) => e.id === fromHash.ep)) ? fromHash.ep : (store.get("lab.ep") || state.episodes[0].id);
    sel.value = startId;
    sel.addEventListener("change", () => loadEpisode(sel.value));
    await loadEpisode(startId, fromHash.x);
  }

  async function loadEpisode(id, exprId) {
    const meta = state.episodes.find((e) => e.id === id) || state.episodes[0];
    const res = await fetch(meta.file, { cache: "no-cache" });
    const ep = await res.json();
    const switching = state.ep && state.ep.videoId !== ep.videoId;
    state.ep = ep;
    store.set("lab.ep", ep.id);
    const padS = (ep.clipPadding && ep.clipPadding.start) || 0;
    const padE = (ep.clipPadding && ep.clipPadding.end) || 0;
    state.items = ep.expressions.map((x) => ({
      ...x,
      clips: x.clips.map((c) => ({ ...c, s: Math.max(0, toSec(c.start) - padS), e: toSec(c.end) + padE })),
    }));
    state.storyById = Object.fromEntries(ep.stories.map((s) => [s.id, s]));
    $("#episode-sub").textContent = `${ep.show} · ${ep.label} · ${ep.stories.map((s) => s.title).join(" + ")} · ${state.items.length} phrases`;
    loadProgress();
    renderChips();
    renderList();
    renderAbout();
    renderProgressBox();
    const first = state.items.find((x) => x.id === exprId) || state.items[0];
    select(first.id, 0, false);
    if (window.YT && YT.Player && !player) createPlayer();
    else if (switching && playerReady) cueClip(state.clip);
    buildDeck();
  }

  /* ---------------- Learn view ---------------- */
  function select(id, clipIdx = 0, autoplay = true) {
    const x = state.items.find((i) => i.id === id);
    if (!x) return;
    state.current = x;
    state.clipIdx = Math.min(clipIdx, x.clips.length - 1);
    state.clip = x.clips[state.clipIdx];
    renderLesson();
    markActive();
    setHash(x.id);
    if (autoplay) playClip(state.clip);
    else { state.clipActive = false; cueClip(state.clip); updateStatus(); }
  }

  function highlight(text, hl) {
    if (!hl) return esc(text);
    const i = text.toLowerCase().indexOf(hl.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + hl.length)) + "</mark>" + esc(text.slice(i + hl.length));
  }

  function scriptHTML(clip) {
    let used = false;
    return clip.lines.map(([who, text]) => {
      let html = esc(text);
      if (!used && clip.hl && text.toLowerCase().includes(clip.hl.toLowerCase())) { html = highlight(text, clip.hl); used = true; }
      return `<p><span class="who">${esc(who)}</span>${html}</p>`;
    }).join("");
  }

  function fact(label, text, cls = "") {
    if (!text) return "";
    return `<div class="fact ${cls}"><h3>${label}</h3><p>${esc(text)}</p></div>`;
  }

  function plainHTML(plain) {
    if (!plain) return "";
    const body = Array.isArray(plain)
      ? `<ol class="steps">${plain.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`
      : `<p>${esc(plain)}</p>`;
    return `<div class="fact plain"><h3>Say it normally</h3><div>${body}</div></div>`;
  }

  function renderLesson() {
    const x = state.current, clip = state.clip;
    const story = state.storyById[x.story];
    const toneTag = /tone/i.test(x.type) ? "tag tone" : "tag";
    const variants = x.clips.length > 1
      ? `<div class="variants" role="group" aria-label="Hear it again in another scene">${x.clips.map((c, i) =>
          `<button type="button" data-clip="${i}" class="${i === state.clipIdx ? "on" : ""}">${i + 1}. ${esc(c.label || fmt(c.s))}</button>`).join("")}</div>`
      : "";
    $("#lesson").innerHTML = `
      <div class="eyebrow"><span class="num">#${x.n}</span><span class="tag">${esc(story ? story.title : "")}</span><span class="${toneTag}">${esc(x.type)}</span><span class="ts">${fmt(clip.s)}–${fmt(clip.e)}</span></div>
      <div class="title-row">
        <h2 class="phrase" id="phrase-title">${esc(x.phrase)}</h2>
        ${marksHTML(x.id, true)}
      </div>
      ${variants}
      <blockquote class="script" id="script">${scriptHTML(clip)}</blockquote>
      <div class="facts">
        ${plainHTML(x.plain)}
        ${fact("Meaning", x.meaning)}
        ${fact("Tone", x.tone, "tone")}
        ${fact("Listen for", x.listen)}
        ${fact("You could say", x.example, "example")}
      </div>`;
    $("#lesson").querySelectorAll(".variants button").forEach((b) =>
      b.addEventListener("click", () => select(x.id, Number(b.dataset.clip), true)));
    bindMarks($("#lesson"));
    applyVeil();
  }

  /* ---------------- Listen first ---------------- */
  // Hides the phrase title and the line in the current view until "Show the words" is clicked.
  function applyVeil() {
    const view = state.mode === "learn" ? $("#lesson") : state.mode === "practice" ? $("#practice") : $("#tone");
    if (!view) return;
    const id = state.current && state.current.id;
    if (state.veilFor !== id) { state.veilFor = id; state.lineShown = false; }
    view.querySelectorAll(".veil-btn, .line-bar").forEach((b) => b.remove());
    const firstScript = view.querySelector(".script");
    if (firstScript) {
      const bar = document.createElement("div");
      bar.className = "line-bar";
      const t = document.createElement("button");
      t.type = "button"; t.className = "ctl veil-toggle" + (state.listenFirst ? " on" : "");
      t.setAttribute("aria-pressed", String(!!state.listenFirst));
      t.textContent = state.listenFirst ? "👁 Always show words" : "🙈 Blur words & listen first";
      t.addEventListener("click", () => {
        state.listenFirst = !state.listenFirst; state.lineShown = false;
        store.set("lab.listen", state.listenFirst ? "1" : "0");
        applyVeil();
      });
      bar.appendChild(t);
      firstScript.insertAdjacentElement("beforebegin", bar);
    }
    const targets = view.querySelectorAll(".phrase, .script, .facts, .reveal");
    const on = state.listenFirst && !state.lineShown;
    targets.forEach((el) => el.classList.toggle("veiled", on));
    if (on && targets.length) {
      const first = view.querySelector(".script") || targets[0];
      first.parentElement.classList.add("veil-wrap");
      const b = document.createElement("button");
      b.type = "button"; b.className = "veil-btn"; b.textContent = "👀 Show the words";
      b.addEventListener("click", () => { state.lineShown = true; applyVeil(); });
      first.insertAdjacentElement("afterend", b);
      b.style.top = first.offsetTop + "px"; b.style.bottom = "auto"; b.style.marginTop = Math.max(0, first.offsetHeight / 2 - 18) + "px";
    }
  }

  /* ---------------- Progress (⭐ / ✓), saved in this browser ---------------- */
  const progKey = () => "lab.progress." + state.ep.id;
  function loadProgress() {
    let p = {};
    try { p = JSON.parse(store.get(progKey()) || "{}"); } catch (e) { p = {}; }
    state.progress = { done: p.done || {}, star: p.star || {} };
  }
  function saveProgress() {
    const ok = store.set(progKey(), JSON.stringify(state.progress));
    const el = $("#saved");
    if (!el) return;
    el.textContent = ok ? "✓ Saved on this computer" : "⚠ Not saved (private window?)";
    el.classList.toggle("warn", !ok);
    el.classList.add("show");
    const pc = $("#prog-code"); if (pc) pc.textContent = progressCode();
    clearTimeout(saveProgress.t);
    saveProgress.t = setTimeout(() => el.classList.remove("show"), 2200);
  }
  const isOn = (kind, id) => !!(state.progress && state.progress[kind][id]);
  function marksHTML(id, big) {
    const s = isOn("star", id), d = isOn("done", id);
    return `<span class="marks ${big ? "big" : ""}">
      <button type="button" class="mk star ${s ? "on" : ""}" data-mark="star" data-mid="${esc(id)}" aria-pressed="${s}" title="Star: come back to this one">${s ? "★" : "☆"}${big ? " Star" : ""}</button>
      <button type="button" class="mk done ${d ? "on" : ""}" data-mark="done" data-mid="${esc(id)}" aria-pressed="${d}" title="Done: covered in class">✓${big ? " Done" : ""}</button>
    </span>`;
  }
  function bindMarks(root) {
    root.querySelectorAll("[data-mark]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMark(b.dataset.mark, b.dataset.mid);
    }));
  }
  function toggleMark(kind, id) {
    const m = state.progress[kind];
    if (m[id]) delete m[id]; else m[id] = Date.now();
    saveProgress();
    renderList();
    if (state.mode === "learn" && state.current) {
      const mk = $("#lesson .marks");
      if (mk) { mk.outerHTML = marksHTML(state.current.id, true); bindMarks($("#lesson")); }
    }
    if (state.mode === "tone") renderTone();
  }

  // "1–12, 15, 18" style lists, by phrase number.
  function ranges(nums) {
    nums = [...new Set(nums)].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < nums.length; i++) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(j > i + 1 ? `${nums[i]}–${nums[j]}` : j === i + 1 ? `${nums[i]}, ${nums[j]}` : `${nums[i]}`);
      i = j;
    }
    return out.join(", ") || "none";
  }
  function numsOf(kind) { return state.items.filter((x) => isOn(kind, x.id)).map((x) => x.n); }
  function progressCode() {
    return `${state.ep.label} progress\nDone: ${ranges(numsOf("done"))}\nStarred: ${ranges(numsOf("star"))}`;
  }
  function parseNums(s) {
    const out = [];
    (s || "").replace(/none/i, "").split(/[,\s]+/).forEach((part) => {
      const m = part.match(/^(\d+)(?:[–—-](\d+))?$/);
      if (!m) return;
      const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) out.push(k);
    });
    return out;
  }
  function restoreFrom(text) {
    const line = (re) => { const m = text.match(re); return m ? m[1] : null; };
    const done = line(/(?:done|✓)\s*:?\s*([^\n]*)/i);
    const star = line(/(?:starred|star|⭐|★)\s*:?\s*([^\n]*)/i);
    if (done === null && star === null) return null;
    const byN = Object.fromEntries(state.items.map((x) => [x.n, x.id]));
    const build = (s) => Object.fromEntries(parseNums(s).filter((n) => byN[n]).map((n) => [byN[n], 1]));
    state.progress = { done: build(done), star: build(star) };
    saveProgress();
    renderList(); if (state.current && state.mode === "learn") renderLesson();
    return { done: Object.keys(state.progress.done).length, star: Object.keys(state.progress.star).length };
  }
  const isToday = (ts) => ts > 1 && new Date(ts).toDateString() === new Date().toDateString();

  function renderProgressBox() {
    if (!$("#progress-body")) return;
    $("#progress-body").innerHTML = `
      <p>Stars and ticks save automatically in this browser. Use the same computer and browser each class (not a private window).</p>
      <p><strong>Progress so far</strong> (also printed at the bottom of every recap):</p>
      <pre class="code" id="prog-code">${esc(progressCode())}</pre>
      <p><button type="button" class="ctl" id="prog-copy">Copy</button></p>
      <p><strong>Restore progress</strong>: paste the lines from a recap, or type them, for example <code>Done: 1–12, 15</code> and <code>Starred: 3, 8</code>.</p>
      <label class="sr-only" for="prog-in">Progress to restore</label>
      <textarea id="prog-in" rows="3" placeholder="Done: 1–12, 15&#10;Starred: 3, 8"></textarea>
      <p class="p-actions"><button type="button" class="ctl primary" id="prog-restore">Restore</button>
      <button type="button" class="ctl" id="prog-reset">Clear all stars and ticks</button>
      <span id="prog-msg" class="status"></span></p>`;
    $("#prog-copy").addEventListener("click", () => {
      const t = progressCode();
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
        () => { $("#prog-msg").textContent = "Copied."; },
        () => { const r = document.createRange(); r.selectNodeContents($("#prog-code")); getSelection().removeAllRanges(); getSelection().addRange(r); $("#prog-msg").textContent = "Selected. Press Ctrl+C to copy."; });
    });
    $("#prog-restore").addEventListener("click", () => {
      const r = restoreFrom($("#prog-in").value);
      $("#prog-msg").textContent = r ? `Restored: ${r.done} done, ${r.star} starred.` : "Couldn't read that. Use lines starting with Done: and Starred:";
      if (r) $("#prog-code").textContent = progressCode();
    });
    let armed = false;
    $("#prog-reset").addEventListener("click", (e) => {
      if (!armed) { armed = true; e.target.textContent = "Click again to clear everything"; setTimeout(() => { armed = false; e.target.textContent = "Clear all stars and ticks"; }, 4000); return; }
      state.progress = { done: {}, star: {} }; saveProgress(); renderList(); if (state.mode === "learn") renderLesson();
      $("#prog-code").textContent = progressCode(); $("#prog-msg").textContent = "Cleared."; armed = false; e.target.textContent = "Clear all stars and ticks";
    });
  }

  /* ---------------- Tone game ---------------- */
  function renderTone() {
    const el = $("#tone");
    const starred = state.items.filter((x) => isOn("star", x.id));
    const pool = starred.length && !state.toneAll ? starred : state.items;
    if (!state.toneId || !pool.some((x) => x.id === state.toneId)) state.toneId = pool[0] && pool[0].id;
    const x = state.items.find((i) => i.id === state.toneId);
    el.innerHTML = `
      <div class="p-top">
        <h2>Tone game</h2>
        <label class="check"><input type="checkbox" id="tone-all" ${state.toneAll || !starred.length ? "checked" : ""} ${!starred.length ? "disabled" : ""}> Show all phrases</label>
      </div>
      ${!starred.length ? `<p class="hint">No starred phrases yet. Star ☆ phrases in Learn to build a shortlist here. For now, all phrases are shown.</p>` : ""}
      <label class="sr-only" for="tone-pick">Choose a phrase</label>
      <select id="tone-pick">${pool.map((i) => `<option value="${esc(i.id)}" ${i.id === state.toneId ? "selected" : ""}>#${i.n} ${esc(i.phrase)}</option>`).join("")}</select>
      ${x ? `
      <div class="title-row"><p class="phrase" style="font-size:1.6rem;margin:0">${esc(x.phrase)}</p>${marksHTML(x.id, false)}</div>
      <blockquote class="script">${scriptHTML(x.clips[0])}</blockquote>
      <p class="p-actions"><button type="button" class="ctl primary" id="tone-play">▶ Hear the original</button></p>
      <p class="hint"><strong>Teacher:</strong> Pick a card. The student says the phrase in that tone. Then ask: "When would you say it like this? What does it mean here?"</p>
      <div class="cards">${(x.toneCards || []).map((c) => `
        <div class="card">
          <div class="card-tone"><span class="emoji" aria-hidden="true">${esc(c.emoji)}</span>${esc(c.tone)}</div>
          <p>${esc(c.situation)}</p>
          ${c.note ? `<p class="card-note">${esc(c.note)}</p>` : ""}
        </div>`).join("")}</div>` : ""}`;
    const all = $("#tone-all"); if (all) all.addEventListener("change", () => { state.toneAll = all.checked; renderTone(); });
    $("#tone-pick").addEventListener("change", (e) => { state.toneId = e.target.value; selectQuiet(state.toneId); renderTone(); });
    const pl = $("#tone-play"); if (pl) pl.addEventListener("click", () => { selectQuiet(x.id); playClip(state.clip); });
    bindMarks(el);
    if (x) selectQuiet(x.id);
    applyVeil();
  }
  function selectQuiet(id) {
    const x = state.items.find((i) => i.id === id);
    if (!x || (state.current === x)) return;
    state.current = x; state.clipIdx = 0; state.clip = x.clips[0]; state.clipActive = false;
    cueClip(state.clip); markActive(); updateStatus();
  }

  /* ---------------- Recap (printable) ---------------- */
  function openRecap() {
    let items = state.items.filter((x) => isToday(state.progress.star[x.id]) || isToday(state.progress.done[x.id]));
    const todayOnly = items.length > 0;
    if (!todayOnly) items = state.items.filter((x) => isOn("star", x.id) || isOn("done", x.id));
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    $("#recap").innerHTML = `
      <div class="recap-bar no-print">
        <button type="button" class="ctl primary" id="recap-print">Print recap</button>
        <button type="button" class="ctl" id="recap-close">Close</button>
        <span class="status">${todayOnly ? `${items.length} phrases starred or ticked today` : items.length ? "Nothing marked today, so this shows everything starred or ticked." : "Nothing starred or ticked yet."}</span>
      </div>
      <div class="sheet">
        <header class="sheet-head">
          <h2>Phrase Lab · Recap</h2>
          <p>${esc(state.ep.show)} ${esc(state.ep.label)} · ${esc(date)}</p>
        </header>
        ${items.map((x) => {
          const c = x.clips[0];
          return `<section class="rc-item">
            <h3><span class="num">#${x.n}</span> ${esc(x.phrase)} ${isOn("star", x.id) ? '<span class="rc-star">★</span>' : ""}</h3>
            <div class="rc-lines">${scriptHTML(c)}</div>
            <p><strong>Meaning:</strong> ${esc(x.meaning)}</p>
            <p><strong>Example:</strong> ${esc(x.example)}</p>
            <p class="rc-write"><strong>My sentence:</strong> <span class="line"></span></p>
          </section>`;
        }).join("") || "<p>Star or tick phrases in Learn, then come back here.</p>"}
        <footer class="sheet-foot">
          <strong>Progress so far</strong> (keep this: it can restore stars and ticks)
          <pre>${esc(progressCode())}</pre>
        </footer>
      </div>`;
    $("#recap").hidden = false;
    document.body.classList.add("recap-open");
    $("#recap-print").addEventListener("click", () => window.print());
    $("#recap-close").addEventListener("click", closeRecap);
    window.scrollTo(0, 0);
  }
  function closeRecap() { $("#recap").hidden = true; document.body.classList.remove("recap-open"); }

  /* ---------------- List ---------------- */
  function renderChips() {
    const chips = [{ id: "all", title: "All" }, ...state.ep.stories];
    $("#story-chips").innerHTML = chips.map((c) =>
      `<button type="button" data-story="${esc(c.id)}" class="${state.storyFilter === c.id ? "on" : ""}">${esc(c.title)}</button>`).join("");
    $("#story-chips").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      state.storyFilter = b.dataset.story; renderChips(); renderList(); buildDeck();
    }));
  }

  function matches(x, q) {
    if (!q) return true;
    const hay = [x.phrase, x.meaning, x.type, x.tone, x.example, ...x.clips.flatMap((c) => c.lines.map((l) => l.join(" ")))].join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }

  function filtered() {
    return state.items.filter((x) => (state.storyFilter === "all" || x.story === state.storyFilter) && matches(x, state.query) && !(state.hideDone && isOn("done", x.id)));
  }

  function renderList() {
    const list = filtered();
    const groups = state.ep.stories.map((s) => ({ s, items: list.filter((x) => x.story === s.id) })).filter((g) => g.items.length);
    $("#expr-list").innerHTML = groups.map((g) =>
      `<li class="group">${esc(g.s.title)}</li>` + g.items.map((x) =>
        `<li class="row ${isOn("done", x.id) ? "is-done" : ""}"><button type="button" class="pick" data-id="${esc(x.id)}"><span class="p"><span class="num">#${x.n}</span> ${esc(x.phrase)}</span><span class="t">${fmt(x.clips[0].s)}${x.clips.length > 1 ? " +" + (x.clips.length - 1) : ""}</span><span class="k">${esc(x.type)}</span></button>${marksHTML(x.id, false)}</li>`).join("")
    ).join("");
    $("#list-empty").hidden = list.length > 0;
    $("#expr-list").querySelectorAll("button[data-id]").forEach((b) => b.addEventListener("click", () => {
      if (state.mode === "tone") { state.toneId = b.dataset.id; selectQuiet(b.dataset.id); renderTone(); playClip(state.clip); return; }
      if (state.mode !== "learn") setMode("learn");
      select(b.dataset.id, 0, true);
      if (window.matchMedia("(max-width: 900px)").matches) $(".player-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    bindMarks($("#expr-list"));
    const total = state.items.length, done = numsOf("done").length, star = numsOf("star").length;
    const lc = $("#list-count"); if (lc) lc.textContent = `${done}/${total} done · ${star} starred`;
    markActive();
  }

  function markActive() {
    document.querySelectorAll("#expr-list button[data-id]").forEach((b) => {
      const on = state.current && b.dataset.id === state.current.id;
      b.closest("li").classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
  }

  function renderAbout() {
    const ep = state.ep;
    $("#about-body").innerHTML = `
      <ul>${ep.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
      <p><strong>Sources</strong></p>
      <ul>${ep.sources.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
      <p>Video: <a href="https://www.youtube.com/watch?v=${esc(ep.videoId)}" target="_blank" rel="noopener">${esc(ep.videoTitle)}</a></p>
      <p>Zoom: when you share your screen, tick <strong>Share sound</strong>, or the student won't hear the clips.</p>
      <p>Blur words &amp; listen first (button above the line): hides the words on every phrase until you click "Show the words", so the student listens before he reads. Click "Always show words" to turn it off.</p>
      <p>Shortcuts: R = replay · L = loop · 1 / 2 / 3 = speed 1×, 0.75×, 0.5×</p>`;
  }

  /* ---------------- Practice ---------------- */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function buildDeck() {
    state.practice.deck = shuffle(filtered().map((x) => x.id));
    state.practice.i = 0; state.practice.revealed = false; state.practice.phraseShown = false;
    if (state.mode === "practice") renderPractice(true);
  }

  function renderPractice(autoplay) {
    const P = state.practice;
    const el = $("#practice");
    if (!P.deck.length) { el.innerHTML = `<h2>Practice</h2><p>No phrases match the current filter.</p>`; return; }
    const x = state.items.find((i) => i.id === P.deck[P.i]);
    state.current = x; state.clipIdx = 0; state.clip = x.clips[0];
    markActive();
    const hear = P.kind === "hear";
    const showPhrase = hear || P.phraseShown;
    el.innerHTML = `
      <div class="p-top">
        <div class="mode-switch" role="group" aria-label="Practice type">
          <button type="button" data-kind="hear" class="${hear ? "on" : ""}">Hear it</button>
          <button type="button" data-kind="recall" class="${!hear ? "on" : ""}">Recall it</button>
        </div>
        <span class="p-count">${P.i + 1} of ${P.deck.length}</span>
      </div>
      <div class="p-step"><span class="p-num">1</span><div>
        ${hear
          ? `<h3>Listen to the clip</h3><p class="phrase" style="font-size:1.5rem">${esc(x.phrase)}</p><blockquote class="script">${scriptHTML(state.clip)}</blockquote>`
          : `<h3>Which phrase means this?</h3><p>${esc(x.meaning)}</p>
             ${showPhrase ? `<p class="phrase" style="font-size:1.5rem">${esc(x.phrase)}</p><blockquote class="script">${scriptHTML(state.clip)}</blockquote>`
                          : `<p class="say">Say the phrase out loud, then check.</p><div class="p-actions"><button type="button" class="ctl primary" id="p-show-phrase">Show phrase + play clip</button></div>`}`}
      </div></div>
      ${showPhrase ? `
      <div class="p-step"><span class="p-num">2</span><div>
        <h3>New situation</h3>
        <p class="situation">${esc(x.practice)}</p>
        <p class="say">Your turn: say your own answer out loud using the phrase.</p>
      </div></div>
      <div class="p-step"><span class="p-num">3</span><div>
        ${P.revealed
          ? `<div class="reveal"><h3>One way to say it</h3><p><strong>${esc(x.example)}</strong></p>${x.tone ? `<p class="ts">Tone: ${esc(x.tone)}</p>` : ""}</div>`
          : `<div class="p-actions"><button type="button" class="ctl" id="p-reveal">Show an example</button></div>`}
      </div></div>` : ""}
      <div class="p-actions">
        <button type="button" class="ctl" id="p-prev" ${P.i === 0 ? "disabled" : ""}>← Back</button>
        <button type="button" class="ctl primary" id="p-next">Next phrase →</button>
        <button type="button" class="ctl" id="p-open">Open full lesson</button>
      </div>`;
    el.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { P.kind = b.dataset.kind; P.revealed = false; P.phraseShown = false; renderPractice(P.kind === "hear"); }));
    const sp = $("#p-show-phrase"); if (sp) sp.addEventListener("click", () => { P.phraseShown = true; renderPractice(true); });
    const rv = $("#p-reveal"); if (rv) rv.addEventListener("click", () => { P.revealed = true; renderPractice(false); });
    $("#p-next").addEventListener("click", () => { P.i = (P.i + 1) % P.deck.length; if (P.i === 0) shuffle(P.deck); P.revealed = false; P.phraseShown = false; renderPractice(P.kind === "hear"); });
    $("#p-prev").addEventListener("click", () => { if (P.i > 0) { P.i--; P.revealed = false; P.phraseShown = false; renderPractice(P.kind === "hear"); } });
    $("#p-open").addEventListener("click", () => { setMode("learn"); select(x.id, 0, false); });
    if (autoplay && showPhrase) playClip(state.clip);
    else { state.clipActive = false; if (playerReady) player.pauseVideo(); updateStatus(); }
    applyVeil();
  }

  function setMode(m) {
    state.mode = m;
    $("#tab-learn").classList.toggle("on", m === "learn");
    $("#tab-practice").classList.toggle("on", m === "practice");
    $("#tab-tone").classList.toggle("on", m === "tone");
    $("#tab-tone").setAttribute("aria-selected", m === "tone");
    $("#tone").hidden = m !== "tone";
    $("#tab-learn").setAttribute("aria-selected", m === "learn");
    $("#tab-practice").setAttribute("aria-selected", m === "practice");
    $("#lesson").hidden = m !== "learn";
    $("#practice").hidden = m !== "practice";
    if (m === "practice") { state.practice.revealed = false; state.practice.phraseShown = false; renderPractice(false); }
    else if (m === "tone") { if (state.current) state.toneId = state.current.id; renderTone(); }
    else if (state.current) renderLesson();
  }

  /* ---------------- Hash ---------------- */
  function parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ""));
    const [ep, x] = h.split("/");
    return { ep, x };
  }
  function setHash(id) {
    const h = "#" + state.ep.id + "/" + id;
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  /* ---------------- Controls ---------------- */
  const sizes = [16, 18, 20, 22];
  let fsI = Math.min(sizes.length - 1, Math.max(0, Number(store.get("lab.fs")) || 0));
  function applyFs() {
    document.documentElement.style.fontSize = sizes[fsI] + "px";
    store.set("lab.fs", String(fsI));
    const d = $("#fs-down"), u = $("#fs-up");
    if (d) d.disabled = fsI === 0;
    if (u) u.disabled = fsI === sizes.length - 1;
  }
  function setRate(r) {
    state.rate = r;
    document.querySelectorAll(".spd").forEach((b) => b.classList.toggle("on", Number(b.dataset.rate) === r));
    if (playerReady) player.setPlaybackRate(r);
  }
  function toggleLoop() {
    state.loop = !state.loop;
    $("#btn-loop").setAttribute("aria-pressed", String(state.loop));
    if (state.loop && state.clip && !state.clipActive) playClip(state.clip);
    updateStatus();
  }

  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
  function bind() {
    on("#btn-replay", "click", () => state.clip && playClip(state.clip));
    on("#btn-loop", "click", toggleLoop);
    on("#fs-up", "click", () => { fsI = Math.min(sizes.length - 1, fsI + 1); applyFs(); });
    on("#fs-down", "click", () => { fsI = Math.max(0, fsI - 1); applyFs(); });
    applyFs();
    state.listenFirst = store.get("lab.listen") === "1";
    if ($("#zoom-tip") && store.get("lab.tip") !== "1") $("#zoom-tip").hidden = false;
    on("#tip-close", "click", () => { $("#zoom-tip").hidden = true; store.set("lab.tip", "1"); });
    document.querySelectorAll(".spd").forEach((b) => b.addEventListener("click", () => setRate(Number(b.dataset.rate))));
    on("#tab-learn", "click", () => setMode("learn"));
    on("#tab-practice", "click", () => setMode("practice"));
    on("#tab-tone", "click", () => setMode("tone"));
    on("#btn-recap", "click", openRecap);
    on("#hide-done", "change", (e) => { state.hideDone = e.target.checked; renderList(); });
    on("#progress-box", "toggle", () => { if ($("#progress-box").open) $("#prog-code").textContent = progressCode(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#recap").hidden) closeRecap(); });
    let t;
    on("#search", "input", (e) => { clearTimeout(t); t = setTimeout(() => { state.query = e.target.value.trim(); renderList(); }, 80); });
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select, textarea")) return;
      if (e.key === "r" || e.key === "R") state.clip && playClip(state.clip);
      else if (e.key === "l" || e.key === "L") toggleLoop();
      else if (e.key === "1") setRate(1);
      else if (e.key === "2") setRate(0.75);
      else if (e.key === "3") setRate(0.5);
    });
    window.addEventListener("hashchange", () => { const h = parseHash(); if (h.x && (!state.current || h.x !== state.current.id)) select(h.x, 0, false); });
  }

  // Test hook: lets a browser check confirm what the player is doing.
  window.__lab = {
    loops: 0, ends: 0,
    get state() { return state; },
    get playerReady() { return playerReady; },
    now() { return playerReady ? { t: player.getCurrentTime(), st: player.getPlayerState(), rate: player.getPlaybackRate() } : null; },
  };

  bind();
  loadIndex().catch((err) => { $("#lesson").innerHTML = `<p>Could not load the lesson file. ${esc(err.message)}</p>`; });
})();
