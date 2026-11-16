// Browser check with a fake YouTube player.
// Usage: node tests/check.js http://localhost:8766/ s1e1
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [base = 'http://localhost:8766/', epId = 's1e1'] = process.argv.slice(2);
const fake = fs.readFileSync(path.join(__dirname, 'fakeyt.js'), 'utf8');
const sec = (t) => String(t).split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: fake }));
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '#' + epId); await p.waitForFunction(() => window.__lab && window.__lab.playerReady);
  const ep = await p.evaluate(() => window.__lab.state.ep);
  if (ep.id !== epId) { await p.selectOption('#episode-select', epId); await p.waitForTimeout(500); }
  const pad = ep.clipPadding || { start: 0, end: 0 };
  let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); };
  for (const x of ep.expressions) {
    await p.click(`button[data-id="${x.id}"]`); await p.waitForTimeout(120);
    const r = await p.evaluate(() => ({ seek: __fake.log.filter((l) => l[0] === 'seek').pop(), mark: document.querySelector('#script mark')?.textContent }));
    ok(r.seek && Math.abs(r.seek[1] - (sec(x.clips[0].start) - pad.start)) < 0.3, `#${x.n} ${x.id} start`);
    ok(r.mark && r.mark.toLowerCase() === x.clips[0].hl.toLowerCase(), `#${x.n} ${x.id} highlight`);
  }
  for (const x of [ep.expressions[0], ep.expressions[ep.expressions.length - 1]]) {
    const end = sec(x.clips[0].end) + pad.end;
    await p.click(`button[data-id="${x.id}"]`); await p.waitForTimeout(150);
    await p.evaluate((t) => { __fake.t = t; }, end - 0.3); await p.waitForTimeout(700);
    let s = await p.evaluate(() => ({ st: __fake.st, t: __fake.t }));
    ok(s.st === 2 && s.t >= end && s.t < end + 0.5, `#${x.n} stops at end ${JSON.stringify(s)}`);
    await p.click('#btn-replay'); await p.waitForTimeout(150);
    s = await p.evaluate(() => __fake.t); ok(Math.abs(s - (sec(x.clips[0].start) - pad.start)) < 0.5, `#${x.n} replay`);
    await p.click('#btn-loop'); await p.evaluate((t) => { __fake.t = t; }, end - 0.3); await p.waitForTimeout(700);
    s = await p.evaluate(() => ({ st: __fake.st, t: __fake.t })); ok(s.st === 1 && s.t < end - 0.5, `#${x.n} loops`);
    await p.click('#btn-loop');
  }
  console.log(`${ep.expressions.length} phrases · page errors: ${errs.length ? errs.join('; ') : 'none'} · PASS ${pass} FAIL ${fail}`);
  await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
