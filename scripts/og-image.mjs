// Takes the share image, public/img/og.png: a still of the finished page at the
// desktop arrangement, 1200 by 630, the size link previews use.
//
//   npm run og        (builds the site, then runs this)
//
// It serves the built site in dist/ itself, on a port nothing else is using, opens
// it, skips the opening and waits for the page to come to rest and the channel
// readout to go. Then it holds everything still in a fixed place, so the picture
// is the same each time: the rail at the start of its roll, the clip at a fixed
// frame, the ring round the dial empty. Set OG_PORT to serve on another port
// (default 4399).

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = process.env.OG_PORT ?? '4399';
const BASE = `http://localhost:${PORT}/`;
const OUT = fileURLToPath(new URL('../public/img/og.png', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ASTRO = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const SIZE = { width: 1200, height: 630 };
// The "CH 1" readout shows for 1.6 s after the set comes on.
const READOUT_MS = 1600;
// The frame of the Studio clip the picture shows, in seconds.
const CLIP_AT_S = 1.5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function answers(url) {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

// A server already on the port is someone else's, serving who knows what.
if (await answers(BASE)) {
  console.error(`Something is already serving ${BASE}. Stop it, or set OG_PORT to a free port.`);
  process.exit(1);
}

// Astro's own command, run by node itself, so the process started here is the
// server and stopping it stops the server.
const server = spawn(process.execPath, [ASTRO, 'preview', '--ignore-lock', '--port', PORT], {
  cwd: ROOT,
  stdio: 'ignore',
});
let exited = false;
server.on('exit', () => {
  exited = true;
});

async function waitForServer(url, tries = 150) {
  for (let i = 0; i < tries; i++) {
    if (exited) throw new Error('The preview server stopped before it was up.');
    if (await answers(url)) return;
    await sleep(100);
  }
  throw new Error(`The preview server did not come up at ${url}`);
}

async function stopServer() {
  if (exited) return;
  server.kill('SIGTERM');
  for (let i = 0; i < 30 && !exited; i++) await sleep(100);
  if (!exited) server.kill('SIGKILL');
}

let browser;
try {
  await waitForServer(BASE);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  await page.goto(BASE);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.documentElement.dataset.stage === 'done');
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => !(animation instanceof CSSTransition) && animation.id !== 'settle'),
  );
  await page.evaluate(() => document.fonts.ready);
  await sleep(READOUT_MS + 400);
  await page.evaluate(async (clipAt) => {
    // The clip that is on, at a fixed frame.
    const clip = document.querySelector('[data-screen] video[data-on]');
    for (const each of document.querySelectorAll('video')) each.pause();
    if (clip !== null) {
      if (clip.readyState < 2) {
        await new Promise((resolve) => clip.addEventListener('loadeddata', resolve, { once: true }));
      }
      clip.currentTime = clipAt;
      await new Promise((resolve) => clip.addEventListener('seeked', resolve, { once: true }));
    }
    // Everything else held: the rail at the start of its loop, so no card is cut
    // by its top edge; the ring empty; no wiggle.
    for (const animation of document.getAnimations()) {
      if (animation.id === 'nudge') {
        animation.cancel();
        continue;
      }
      animation.pause();
      const target = animation.effect?.target;
      const isRail = target instanceof Element && target.matches('[data-rail-track]');
      if (isRail || animation.id === 'ring') animation.currentTime = 0;
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, CLIP_AT_S);
  await page.screenshot({ path: OUT });
  console.log(`${OUT}: ${Math.round(statSync(OUT).size / 1024)} KB`);
} finally {
  await browser?.close();
  await stopServer();
}
