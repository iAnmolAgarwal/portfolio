// The session engine: types the boot command, spins the spark, streams the
// answer (which is already in the DOM), then hands the prompt to the visitor.

const WORDS = ['Pondering', 'Churning', 'Composing', 'Reticulating', 'Noodling', 'Percolating', 'Spelunking'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const POINTER_FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (base: number, spread: number) => base + Math.random() * spread;

type ThwipState = 'idle' | 'thinking' | 'done' | 'error' | 'hidden';
const thwip = (s: ThwipState) => $('thwip')?.setAttribute('data-state', s);

let items: HTMLElement[] = [];
let skipped = false;
let userScrolled = false;
let running = false;
let startedAt = 0;

export function startSession() {
  items = [...document.querySelectorAll<HTMLElement>('[data-stream]')];
  initCommands();
  window.addEventListener('wheel', () => (userScrolled = true), { passive: true });
  window.addEventListener('touchmove', () => (userScrolled = true), { passive: true });

  if (REDUCED || location.hash) {
    revealAll();
    if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }), 60);
    return;
  }
  void run();
}

async function run() {
  running = true;
  skipped = false;
  userScrolled = false;
  startedAt = performance.now();
  const typed = $('typed');
  const think = $('think');
  const thinkWord = $('think-word');
  const thinkMeta = $('think-meta');
  const spark = $('spark');
  const skipBtn = $('skip');
  const cmd = typed.dataset.cmd ?? typed.textContent ?? '';

  const onKey = () => skip();
  window.addEventListener('keydown', onKey, { once: true });
  skipBtn.hidden = false;
  skipBtn.onclick = skip;

  // 1. type the command
  typed.textContent = '';
  typed.classList.add('caret');
  await sleep(500);
  for (const ch of cmd) {
    if (skipped) break;
    typed.textContent += ch;
    await sleep(ch === ' ' ? jitter(90, 60) : jitter(38, 55));
  }
  typed.classList.remove('caret');
  if (skipped) return finish();

  // 2. think
  think.hidden = false;
  spark.classList.add('spin');
  thwip('thinking');
  const t0 = performance.now();
  let word = 0;
  const thinkFor = 1600;
  while (performance.now() - t0 < thinkFor && !skipped) {
    const el = (performance.now() - t0) / 1000;
    if (Math.floor(el / 0.7) !== word) word = Math.floor(el / 0.7);
    thinkWord.textContent = `${WORDS[word % WORDS.length]}…`;
    const toks = Math.round(el * 1400);
    thinkMeta.textContent = `(${el.toFixed(1)}s · ↓ ${toks >= 1000 ? (toks / 1000).toFixed(1) + 'k' : toks} tokens · thinking with high effort)`;
    await sleep(100);
  }
  if (skipped) return finish();

  // 3. stream: tools, then the typed lede, then everything else
  for (const el of items) {
    if (skipped) break;
    if (el.dataset.type !== undefined) {
      think.hidden = true;
      spark.classList.remove('spin');
      await typeInto(el);
      continue;
    }
    reveal(el);
    if (el.classList.contains('tool') || el.classList.contains('result')) el.after(think); // spinner stays bottom-most
    const len = el.textContent?.trim().length ?? 0;
    const pace = el.dataset.pace === 'fast' ? jitter(110, 70) : Math.min(170, 30 + len * 1.2);
    await sleep(pace);
  }
  finish();
}

function reveal(el: HTMLElement) {
  el.classList.remove('pending');
  el.classList.add('reveal');
  if (!userScrolled) el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

async function typeInto(el: HTMLElement) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; full: string }[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if ((n.parentElement as HTMLElement | null)?.closest('[aria-hidden]')) continue;
    nodes.push({ node: n as Text, full: (n as Text).data });
  }
  nodes.forEach((x) => (x.node.data = ''));
  el.classList.remove('pending');
  el.classList.add('caret');
  for (const { node, full } of nodes) {
    // stream in small chunks like a model, not one keystroke at a time
    let i = 0;
    while (i < full.length && !skipped) {
      const step = 2 + Math.floor(Math.random() * 3);
      i = Math.min(full.length, i + step);
      node.data = full.slice(0, i);
      await sleep(jitter(9, 11));
    }
    if (skipped) node.data = full;
  }
  el.classList.remove('caret');
  if (!userScrolled) el.scrollIntoView({ block: 'nearest' });
}

function skip() {
  if (!running) return;
  skipped = true;
  revealAll();
}

function revealAll() {
  const typed = $('typed');
  typed.textContent = typed.dataset.cmd ?? typed.textContent;
  typed.classList.remove('caret');
  $('think').hidden = true;
  $('spark').classList.remove('spin');
  for (const el of items) {
    el.classList.remove('pending', 'caret');
    // restore any partially typed text nodes
    if (el.dataset.type !== undefined) restoreText(el);
  }
  finish();
}

const originals = new WeakMap<HTMLElement, string>();
function restoreText(el: HTMLElement) {
  const html = originals.get(el);
  if (html !== undefined) el.innerHTML = html;
}

function finish() {
  running = false;
  $('palette')?.classList.remove('pending');
  const secs = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
  const w = $('worked-text');
  if (w) w.textContent = `Worked for ${startedAt ? secs : 3}s`;
  $('skip').hidden = true;
  thwip('done');
  setTimeout(() => thwip('idle'), 1200);
  if (POINTER_FINE) $('cmd')?.focus({ preventScroll: true });
}

/* ------------------------------ commands ------------------------------ */

const SECTIONS: Record<string, string> = {
  '/whoami': 'whoami',
  '/projects': 'projects',
  '/experience': 'experience',
  '/cp': 'cp',
  '/stack': 'stack',
  '/stats': 'stats',
  '/contact': 'contact',
};
const HELP: [string, string][] = [
  ['/help', 'list commands'],
  ['/whoami', 'the short version'],
  ['/projects', 'what I have built'],
  ['/experience', 'internship + education'],
  ['/cp', 'competitive programming'],
  ['/stack', 'languages and tools'],
  ['/stats', 'the numbers'],
  ['/contact', 'where to find me'],
  ['/resume', 'open the PDF'],
  ['/clear', 'replay the session'],
];
const NAMES = HELP.map(([n]) => n);

function initCommands() {
  const input = $<HTMLInputElement>('cmd');
  const ghost = $('ghost');
  const form = $<HTMLFormElement>('cmdform');
  const lede = document.getElementById('whoami');
  if (lede) originals.set(lede, lede.innerHTML);

  const completion = (v: string) => (v.startsWith('/') && v.length > 0 ? NAMES.find((n) => n.startsWith(v) && n !== v) : undefined);
  const paint = () => {
    const v = input.value;
    const c = completion(v);
    ghost.textContent = c ? c.slice(v.length) + '  ⇥' : '';
    form.style.setProperty('--n', String(v.length));
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const c = completion(input.value);
      if (c) { e.preventDefault(); input.value = c; paint(); }
    } else if (e.key === 'Escape') {
      input.value = ''; paint();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    input.value = ''; paint();
    if (v) runCommand(v);
  });
  document.querySelectorAll<HTMLAnchorElement>('.chips a[data-cmd]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const c = a.dataset.cmd!;
      if (c === '/resume') return; // let the link open the PDF
      e.preventDefault();
      runCommand(c);
    });
  });
}

function log(html: string, cls = '') {
  const box = $('log');
  const d = document.createElement('div');
  d.className = `line ${cls}`.trim();
  d.innerHTML = html;
  box.appendChild(d);
  while (box.children.length > 14) box.firstElementChild?.remove();
  return d;
}

function runCommand(raw: string) {
  const v = raw.startsWith('/') ? raw : `/${raw}`;
  if (running) skip();
  log(`<span class="chev" aria-hidden="true">›</span><span>${escapeHtml(v)}</span>`, 'sent');

  if (v === '/help') {
    log(HELP.map(([n, d]) => `  <span class="accent">${n.padEnd(12, ' ')}</span><span class="meta">${d}</span>`).join('\n'), 'line');
    pulse('done');
    return;
  }
  if (v === '/clear') {
    $('log').innerHTML = '';
    for (const el of items) el.classList.add('pending');
    window.scrollTo({ top: 0, behavior: 'auto' });
    thwip('idle');
    void run();
    return;
  }
  if (v === '/resume') {
    log(`<span class="result">opening anmol-agarwal-resume.pdf</span>`, 'line');
    window.open('/anmol-agarwal-resume.pdf', '_blank', 'noopener');
    pulse('done');
    return;
  }
  const id = SECTIONS[v];
  if (id) {
    const el = document.getElementById(id)!;
    history.replaceState(null, '', `#${id}`);
    el.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    log(`<span class="result">jumped to ${id}</span>`, 'line');
    pulse('done');
    return;
  }
  const guess = suggest(v);
  log(
    `<span class="err">✗ Unknown command: ${escapeHtml(v)}</span>` +
      (guess ? ` <span class="meta">— did you mean</span> <a href="#${SECTIONS[guess] ?? 'palette'}" data-sugg="${guess}">${guess}</a><span class="meta">?</span>` : ` <span class="meta">— try /help</span>`),
    'line',
  ).querySelector('a')?.addEventListener('click', (e) => { e.preventDefault(); runCommand(guess!); });
  pulse('error');
}

function pulse(s: ThwipState) {
  thwip(s);
  setTimeout(() => thwip('idle'), s === 'error' ? 1600 : 1000);
}

function suggest(v: string): string | undefined {
  const byPrefix = NAMES.find((n) => n.startsWith(v.slice(0, 3)));
  if (byPrefix) return byPrefix;
  const limit = Math.max(1, Math.floor(v.length / 3));
  let best: string | undefined, bd = limit + 1;
  for (const n of NAMES) { const d = lev(v, n); if (d < bd) { bd = d; best = n; } }
  return best;
}
function lev(a: string, b: string) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
