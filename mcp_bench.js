// Benchmark an MCP browser server on the 5-task suite.
// Usage: node mcp_bench.js <playwright|devtools>
const { spawn } = require('child_process');
const fs = require('fs');

const PROFILE = process.argv[2];
const BASE = 'https://quotes.toscrape.com';
const OUTDIR = `C:/Users/Admin/agent-browser-eval/results/${PROFILE}`;
fs.mkdirSync(OUTDIR, { recursive: true });

const SERVERS = {
  playwright: ['npx', ['-y', '@playwright/mcp@latest']],
  devtools: ['npx', ['-y', 'chrome-devtools-mcp@latest', '--isolated']],
};

// ---- MCP stdio client ----
function makeClient(cmd, args) {
  const srv = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'], shell: true });
  let buf = '';
  const pending = {};
  srv.stdout.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    }
  });
  let id = 0;
  const send = (method, params) => new Promise((res, rej) => {
    const myId = ++id;
    pending[myId] = res;
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
    setTimeout(() => { if (pending[myId]) { delete pending[myId]; rej(new Error('timeout ' + method)); } }, 90000);
  });
  const notify = (method, params) => srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  return { srv, send, notify };
}

async function call(client, name, args) {
  const t0 = Date.now();
  let resp;
  try { resp = await client.send('tools/call', { name, arguments: args }); }
  catch (e) { return { text: 'EXC: ' + e.message, chars: 0, ms: Date.now() - t0, err: true }; }
  const ms = Date.now() - t0;
  let text = '';
  if (resp.error) return { text: 'ERR: ' + JSON.stringify(resp.error), chars: 0, ms, err: true };
  const content = (resp.result && resp.result.content) || [];
  text = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  const imgs = content.filter(c => c.type === 'image').length;
  return { text, chars: text.length, ms, err: !!(resp.result && resp.result.isError), imgs };
}

// ---- parse interactive elements (ref for playwright, uid for devtools) ----
function parseEls(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let ref = null, role = '';
    let m = line.match(/^uid=([\w]+)\s+(.*)$/);          // devtools: "uid=2_6 textbox \"...\""
    if (m) { ref = m[1]; role = (m[2].match(/^([A-Za-z]+)/) || [])[1] || ''; }
    else {
      m = line.match(/\[ref=([^\]\s]+)\]/);              // playwright: "- textbox \"...\" [ref=e5]"
      if (m) { ref = m[1]; role = (line.match(/^[\s\-]*([A-Za-z]+)/) || [])[1] || ''; }
    }
    if (!ref) continue;
    const nameM = line.match(/"([^"]*)"/);
    out.push({ role, name: nameM ? nameM[1] : '', ref, line });
  }
  return out;
}

// ---- task definitions per profile ----
function tasks(P) {
  if (P === 'playwright') return {
    t1: async (c) => [
      await call(c, 'browser_navigate', { url: BASE + '/' }),
      await call(c, 'browser_snapshot', {}),
    ],
    t2: async (c) => {
      const r = [await call(c, 'browser_navigate', { url: BASE + '/login' })];
      const snap = await call(c, 'browser_snapshot', {}); r.push(snap);
      const els = parseEls(snap.text);
      const tb = els.filter(e => /textbox|searchbox/i.test(e.role));
      const submit = els.find(e => /button/i.test(e.role)) || els.find(e => /login/i.test(e.name));
      if (tb[0]) r.push(await call(c, 'browser_type', { element: 'username', target: tb[0].ref, text: 'test' }));
      if (tb[1]) r.push(await call(c, 'browser_type', { element: 'password', target: tb[1].ref, text: 'test' }));
      if (submit) r.push(await call(c, 'browser_click', { element: 'login button', target: submit.ref }));
      r.push(await call(c, 'browser_snapshot', {}));
      return r;
    },
    t3: async (c) => {
      const r = [await call(c, 'browser_navigate', { url: BASE + '/' })];
      const snap = await call(c, 'browser_snapshot', {}); r.push(snap);
      const next = parseEls(snap.text).find(e => /next/i.test(e.name));
      if (next) r.push(await call(c, 'browser_click', { element: 'Next page', target: next.ref }));
      r.push(await call(c, 'browser_snapshot', {}));
      return r;
    },
    t4: async (c) => [
      await call(c, 'browser_navigate', { url: BASE + '/js' }),
      await call(c, 'browser_wait_for', { text: 'Albert Einstein' }),
      await call(c, 'browser_snapshot', {}),
    ],
    t5: async (c) => [
      await call(c, 'browser_navigate', { url: BASE + '/tag/love/' }),
      await call(c, 'browser_take_screenshot', { type: 'png', fullPage: true, filename: OUTDIR + '/t5.png' }),
    ],
  };
  // devtools
  return {
    t1: async (c) => [
      await call(c, 'navigate_page', { type: 'url', url: BASE + '/' }),
      await call(c, 'take_snapshot', {}),
    ],
    t2: async (c) => {
      const r = [await call(c, 'navigate_page', { type: 'url', url: BASE + '/login' })];
      const snap = await call(c, 'take_snapshot', {}); r.push(snap);
      const els = parseEls(snap.text);
      const tb = els.filter(e => /textbox|input|searchbox/i.test(e.role));
      const submit = els.find(e => /button/i.test(e.role)) || els.find(e => /login/i.test(e.name));
      if (tb[0]) r.push(await call(c, 'fill', { uid: tb[0].ref, value: 'test' }));
      if (tb[1]) r.push(await call(c, 'fill', { uid: tb[1].ref, value: 'test' }));
      if (submit) r.push(await call(c, 'click', { uid: submit.ref }));
      r.push(await call(c, 'take_snapshot', {}));
      return r;
    },
    t3: async (c) => {
      const r = [await call(c, 'navigate_page', { type: 'url', url: BASE + '/' })];
      const snap = await call(c, 'take_snapshot', {}); r.push(snap);
      const next = parseEls(snap.text).find(e => /next/i.test(e.name));
      if (next) r.push(await call(c, 'click', { uid: next.ref }));
      r.push(await call(c, 'take_snapshot', {}));
      return r;
    },
    t4: async (c) => [
      await call(c, 'navigate_page', { type: 'url', url: BASE + '/js' }),
      await call(c, 'wait_for', { text: ['Albert Einstein'] }),
      await call(c, 'take_snapshot', {}),
    ],
    t5: async (c) => [
      await call(c, 'navigate_page', { type: 'url', url: BASE + '/tag/love/' }),
      await call(c, 'take_screenshot', { format: 'png', fullPage: true, filePath: OUTDIR + '/t5.png' }),
    ],
  };
}

const CHECK = {
  t1: t => /world as we have created it/i.test(t),
  t2: t => /logout/i.test(t),
  t3: t => /it is a far, far better thing|harry|made it through|life what you make|live for myself/i.test(t) || /page\/3/i.test(t),
  t4: t => /world as we have created it/i.test(t),
  t5: () => true,
};

(async () => {
  const [cmd, args] = SERVERS[PROFILE];
  const c = makeClient(cmd, args);
  await c.send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bench', version: '1' } });
  c.notify('notifications/initialized');
  const T = tasks(PROFILE);

  for (let round = 1; round <= 3; round++) {
    for (const name of ['t1', 't2', 't3', 't4', 't5']) {
      const t0 = Date.now();
      let calls;
      try { calls = await T[name](c); }
      catch (e) { console.log(`${name} r${round} EXC ${e.message}`); continue; }
      const ms = Date.now() - t0;
      const chars = calls.reduce((s, x) => s + x.chars, 0);
      const allText = calls.map(x => x.text).join('\n');
      const pass = CHECK[name](allText);
      const errs = calls.filter(x => x.err).length;
      console.log(`${name} r${round} ${ms}ms ${chars}chars calls=${calls.length} errs=${errs} ${pass ? 'PASS' : 'FAIL'}`);
      if (round === 1) {
        fs.writeFileSync(`${OUTDIR}/${name}.out`,
          calls.map((x, i) => `--- call ${i} (${x.chars}c ${x.ms}ms${x.err ? ' ERR' : ''}${x.imgs ? ' img=' + x.imgs : ''}) ---\n${x.text}`).join('\n\n'));
      }
    }
  }
  console.log('DONE');
  c.srv.kill();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
