// Records the Pathwise channel clip and its poster from the live site into
// public/media/. The Studio and Worth clips are cut by cut-clips.sh.
//
//   node scripts/media/record-pathwise.mjs
//
// Two shots, both from the public landing page, joined by a short dissolve:
//   1. the landing screen as Nova (the robot) arrives and the camera pulls back
//   2. the "six steps" card deck, stepped forward three times with its own Next
//      button, from "Find what's missing" to "Put them in order"
// The real learning plan sits behind a Google sign-in, so this script never opens it:
// it does not sign in, does not type anything and never moves the mouse.
//
// The page is drawn at 2x and scaled down to 1280 wide so the text stays sharp. The
// output matches cut-clips.sh: 7.00 s (210 frames), 30 fps, H.264 yuv420p, silent,
// moov atom up front, closing with a cross-fade back to the first frame.
//
// Set PATHWISE_KEEP=1 to keep the captured frames (their folder is printed).

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://trypathwise.vercel.app';
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;

// Shot lengths in seconds. HERO + DECK - DISSOLVE is the length of the clip.
const HERO = 2.8;
const DECK = 4.6;
const DISSOLVE = 0.4; // landing screen into the card deck
const LOOP_FADE = 0.35; // end of the clip back into its first frame
const LENGTH = HERO + DECK - DISSOLVE;

// When the deck's Next button is pressed, in seconds from the start of the deck shot.
const DECK_STEPS = [0.8, 2.0, 3.2];

// The deck shot is framed on the heading and the cards (the right third of that
// section is empty), in pixels of the 2560x1440 frame. It stays 16:9.
const DECK_CROP = 'crop=1792:1008:16:216';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'public', 'media');
const work = mkdtempSync(join(tmpdir(), 'pathwise-clip-'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => Date.now() / 1000;

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

// Writes an ffmpeg concat list holding what was on screen between `from` and `to`
// (epoch seconds), each frame lasting until the next one arrived.
function writeShot(name, frames, from, to) {
  let first = frames.findLastIndex((frame) => frame.at <= from);
  if (first < 0) first = 0;
  const shot = frames.slice(first).filter((frame) => frame.at < to);
  if (shot.length < 2) throw new Error(`${name}: only ${shot.length} frame(s) captured`);

  const lines = ['ffconcat version 1.0'];
  let longestGap = 0;
  shot.forEach((frame, i) => {
    const start = Math.max(frame.at, from);
    const end = i + 1 < shot.length ? shot[i + 1].at : to;
    longestGap = Math.max(longestGap, end - start);
    lines.push(`file '${frame.file}'`, `duration ${(end - start).toFixed(6)}`);
  });
  lines.push(`file '${shot.at(-1).file}'`);

  const list = join(work, `${name}.ffconcat`);
  writeFileSync(list, lines.join('\n') + '\n');
  console.log(`${name}: ${shot.length} frames over ${(to - from).toFixed(2)} s, longest still ${longestGap.toFixed(2)} s`);
  return list;
}

async function record() {
  // A real 2x window (not an emulated one), so the screencast frames are 2560x1440,
  // and the machine's GPU, so the robot is drawn at full frame rate.
  const browser = await chromium.launch({
    args: [
      '--force-device-scale-factor=2',
      `--window-size=${WIDTH},${HEIGHT}`,
      '--use-angle=metal',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--hide-scrollbars',
    ],
  });

  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    // No pointer is ever shown: the mouse is never moved and the cursor is switched off.
    await page.addInitScript(() => {
      const hide = () => {
        const style = document.createElement('style');
        style.textContent = '*, *::before, *::after { cursor: none !important; }';
        document.head.append(style);
      };
      if (document.head) hide();
      else document.addEventListener('DOMContentLoaded', hide);
    });

    const cdp = await context.newCDPSession(page);
    const frames = [];
    cdp.on('Page.screencastFrame', (frame) => {
      const file = join(work, `frame-${String(frames.length).padStart(5, '0')}.jpg`);
      writeFileSync(file, Buffer.from(frame.data, 'base64'));
      frames.push({ file, at: frame.metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });

    // Shot 1: the landing screen. Nova replaces the loader, lights up over about a
    // third of a second, then the camera pulls back from her face.
    const loader = page.locator('[aria-label="Loading Nova"]');
    await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await loader.waitFor({ state: 'attached', timeout: 30_000 });
    await loader.waitFor({ state: 'detached', timeout: 60_000 });
    await sleep(450);
    const heroFrom = now();
    await sleep(HERO * 1000 + 200);

    // Shot 2: the six-step deck. The jump down the page happens off camera.
    const deck = page.locator('#how-it-works');
    await deck.evaluate((section) => section.scrollIntoView({ behavior: 'instant', block: 'start' }));
    await sleep(2500);
    const next = deck.getByRole('button', { name: 'Next step' });
    const deckFrom = now();
    for (const at of DECK_STEPS) {
      await sleep(Math.max(0, (deckFrom + at - now()) * 1000));
      await next.evaluate((button) => /** @type {HTMLElement} */ (button).click());
    }
    await sleep(Math.max(0, (deckFrom + DECK - now()) * 1000) + 200);

    await cdp.send('Page.stopScreencast');
    return {
      hero: writeShot('hero', frames, heroFrom, heroFrom + HERO),
      deck: writeShot('deck', frames, deckFrom, deckFrom + DECK),
    };
  } finally {
    await browser.close();
  }
}

function encode({ hero, deck }) {
  mkdirSync(outDir, { recursive: true });
  const clip = join(outDir, 'pathwise.mp4');
  const poster = join(outDir, 'pathwise.jpg');

  // Screencast frames are full-range JPEG; convert once to broadcast-range BT.709.
  const tidy =
    `scale=${WIDTH}:${HEIGHT}:flags=lanczos:in_range=pc:out_range=tv:` +
    `in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,settb=AVTB`;
  const graph = [
    `[0:v]fps=${FPS},${tidy},trim=duration=${HERO},setpts=PTS-STARTPTS,split[hero][copy]`,
    `[1:v]fps=${FPS},${DECK_CROP},${tidy},trim=duration=${DECK},setpts=PTS-STARTPTS[deck]`,
    `[copy]trim=end_frame=1,tpad=stop_mode=clone:stop_duration=1,settb=AVTB[first]`,
    `[hero][deck]xfade=transition=fade:duration=${DISSOLVE}:offset=${HERO - DISSOLVE}[both]`,
    `[both][first]xfade=transition=fade:duration=${LOOP_FADE}:offset=${LENGTH - LOOP_FADE},` +
      `trim=duration=${LENGTH},setpts=PTS-STARTPTS[v]`,
  ].join(';');

  // The encoder settings shared with cut-clips.sh. Keep the two in step.
  ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', hero,
    '-f', 'concat', '-safe', '0', '-i', deck,
    '-filter_complex', graph, '-map', '[v]', '-frames:v', String(Math.round(LENGTH * FPS)),
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '18', '-maxrate', '1500k', '-bufsize', '3000k',
    '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-an', '-movflags', '+faststart',
    clip,
  ]);

  // Poster: the clip's own first frame, Nova's face beside the headline.
  ffmpeg(['-i', clip, '-frames:v', '1', '-q:v', '3', '-update', '1', poster]);
  console.log('wrote pathwise.mp4 and pathwise.jpg');
}

try {
  encode(await record());
} finally {
  if (process.env.PATHWISE_KEEP) console.log(`kept frames in ${work}`);
  else rmSync(work, { recursive: true, force: true });
}
