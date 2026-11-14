// Takes the share image, public/img/og.png: a still of the finished page at the
// desktop arrangement, 1200 by 630, the size link previews use.
//
//   npm run build && node scripts/og-image.mjs
//
// It serves the built site in dist/ itself, opens it, skips the opening, waits for
// the page to come to rest and for the channel readout to go, then holds still
// and takes the picture. Set OG_PORT to serve on another port (default 4399).

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = process.env.OG_PORT ?? '4399';
const BASE = `http://localhost:${PORT}/`;
const OUT = fileURLToPath(new URL('../public/img/og.png', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SIZE = { width: 1200, height: 630 };
// The "CH 1" readout shows for 1.6 s after the set comes on.
const READOUT_MS = 1600;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(100);
  }
  throw new Error(`The preview server did not come up at ${url}`);
}

const server = spawn('npx', ['astro', 'preview', '--ignore-lock', '--port', PORT], {
  cwd: ROOT,
  stdio: 'ignore',
});

const browser = await chromium.launch();
try {
  await waitForServer(BASE);
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  await page.goto(BASE);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.documentElement.dataset.stage === 'done');
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => !(animation instanceof CSSTransition)),
  );
  await sleep(READOUT_MS + 400);
  // The clip and everything else held where they are.
  await page.evaluate(async () => {
    for (const clip of document.querySelectorAll('video')) clip.pause();
    for (const animation of document.getAnimations()) animation.pause();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path: OUT });
  console.log(`${OUT}: ${Math.round(statSync(OUT).size / 1024)} KB`);
} finally {
  await browser.close();
  server.kill();
}
