// The page's one script. Each part of the page that moves is set up by its own
// function or module, and they are put together at the bottom of this file.

import { CHANNELS, TIMING } from '../data/site';
import { createChannels } from './channels';
import { channelToAngle, setDialValue, wireDial } from './dial';
import { find } from './dom';
import { startRail } from './rail';
import { createPageOpening, type Cast, type Scene } from './scene';

declare global {
  interface Window {
    /** Set by the page's head: shows the finished page if this script never runs. */
    openingRescue?: number;
  }
}

type Timer = ReturnType<typeof setTimeout>;

// ---------- channels and the dial ----------

// The words under the set fade out for this long before they are replaced.
const WORDS_OUT_MS = 240;
const NUDGE_MS = 1100;
// With reduced motion a new picture fades in over the old one for this long.
const CROSS_FADE_MS = 220;

// A burst of static: the noise jumps about while it thins out in four steps.
const STATIC_FRAMES: Keyframe[] = [
  { opacity: 1, backgroundPosition: '0 0', easing: 'steps(4)' },
  { backgroundPosition: '-60px 40px', offset: 0.33, easing: 'steps(4)' },
  { backgroundPosition: '30px -70px', offset: 0.66, easing: 'steps(4)' },
  { opacity: 0, backgroundPosition: '-20px 10px' },
];

// The dial's wiggle. It turns `rotate`, so it adds to the angle the dial rests at.
const NUDGE_FRAMES: Keyframe[] = [
  { rotate: '0deg', easing: 'ease-in-out' },
  { rotate: '9deg', offset: 0.25, easing: 'ease-in-out' },
  { rotate: '-7deg', offset: 0.55, easing: 'ease-in-out' },
  { rotate: '4deg', offset: 0.8, easing: 'ease-in-out' },
  { rotate: '0deg' },
];

const RING_FRAMES: Keyframe[] = [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }];

/**
 * Wires the set and its dial, and hands back the switch. Nothing plays or counts
 * down until `switchOn` is called. With `reduced`, for a visitor who asked for less
 * motion, the set never changes channel by itself, shows each clip's still frame
 * without playing it, and changes channel by a plain cross-fade with no static.
 */
function initChannels(reduced: boolean): Cast['set'] {
  const root = document.documentElement;
  const screen = find<HTMLElement>('[data-screen]');
  const clips = Array.from(screen.querySelectorAll('video'));
  const fuzz = find<HTMLElement>('[data-static]', screen);
  const osd = find<HTMLElement>('[data-osd]', screen);
  const dial = find<HTMLElement>('[data-dial]');
  const ring = find<SVGCircleElement>('[data-ring]');
  const now = find<HTMLElement>('[data-now]');
  const title = find<HTMLElement>('[data-now-title]', now);
  const line = find<HTMLElement>('[data-now-line]', now);
  const links = find<HTMLElement>('[data-now-links]', now);

  // Has the visitor turned the dial yet. Once they have, the note beside it and
  // the wiggle are gone for good.
  let touched = root.hasAttribute('data-touched');
  // Has the set been switched on. Until then nothing counts down.
  let on = false;
  // Is the visitor reading the words under the set: the pointer is over them, or
  // the keyboard is on one of their links. The channel waits for them.
  let pointerOnWords = false;
  let keyboardInWords = false;
  // When the 20 seconds after the last turn by hand are up, on `performance.now()`.
  let manualUntil = 0;

  // One of each at a time, however fast the channel is changed.
  let flash: Animation | undefined;
  let fade: Animation | undefined;
  let fill: Animation | undefined;
  let wiggle: Animation | undefined;
  let osdTimer: Timer | undefined;
  let wordsTimer: Timer | undefined;
  let nudgeTimer: Timer | undefined;

  // The channel whose words are under the set, and the one they are changing to.
  let wordsShown = Math.max(
    0,
    CHANNELS.findIndex((channel) => String(channel.number) === root.dataset.channel),
  );
  let wordsWanted = wordsShown;

  // ----- the screen -----

  function flashStatic(): void {
    flash?.cancel();
    flash = fuzz.animate(STATIC_FRAMES, { duration: TIMING.staticMs, id: 'static' });
  }

  // In place of the static: the picture that was on stays under the new one
  // while the new one fades in.
  function crossFade(from: HTMLVideoElement, to: HTMLVideoElement): void {
    fade?.cancel();
    for (const clip of clips) clip.removeAttribute('data-leaving');
    from.setAttribute('data-leaving', '');
    fade = to.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: CROSS_FADE_MS,
      easing: 'ease',
      id: 'fade',
    });
    // A fade that was cut short has already been tidied up by the one after it.
    fade.finished.then(
      () => from.removeAttribute('data-leaving'),
      () => undefined,
    );
  }

  // If a clip cannot play, its poster is what the screen shows. It is also all
  // the screen shows for a visitor who asked for less motion.
  function play(clip: HTMLVideoElement): void {
    if (reduced) return;
    if (clip.error !== null) clip.load();
    clip.play().catch(() => undefined);
  }

  // Puts one channel's clip on the screen, playing from its start. This is called
  // as the static begins, so the swap and the clip's first frame replacing its
  // poster both happen behind the static.
  function showClip(index: number): void {
    const was = clips.find((clip) => clip.hasAttribute('data-on'));
    clips.forEach((clip, at) => {
      clip.toggleAttribute('data-on', at === index);
      if (at !== index) clip.pause();
      // A clip that has not played yet is left alone, so it keeps its poster.
      if (clip.currentTime > 0) clip.currentTime = 0;
    });
    if (reduced && was !== undefined && was !== clips[index]) crossFade(was, clips[index]);
    if (!document.hidden) play(clips[index]);
  }

  // Only the first channel's clip is fetched with the page. The others are served
  // with `preload="none"` and are fetched once one clip is playing, which is after
  // the set is on, so that each is ready by the time its channel comes round.
  function loadTheRest(): void {
    for (const clip of clips) clip.preload = 'auto';
  }

  function readOut(index: number): void {
    osd.textContent = `CH ${CHANNELS[index].number}`;
    osd.setAttribute('data-on', '');
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => osd.removeAttribute('data-on'), TIMING.osdMs);
  }

  // ----- the words under the set -----

  function writeWords(index: number): void {
    const channel = CHANNELS[index];
    title.textContent = channel.title;
    line.textContent = channel.line;
    now.style.setProperty('--accent', channel.accent);
    // If one of the links has focus, the link that takes its place gets it, so
    // that replacing them never drops the visitor's place on the page.
    const focusAt = Array.from(links.children).findIndex((a) => a === document.activeElement);
    const fresh = channel.links.map((link) => {
      const a = document.createElement('a');
      a.className = 'link';
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = link.label;
      return a;
    });
    links.replaceChildren(...fresh);
    if (focusAt >= 0) fresh[Math.min(focusAt, fresh.length - 1)]?.focus({ preventScroll: true });
    wordsShown = index;
  }

  // Fades the words out, replaces them and lets them back in. A change that
  // arrives while they are out only changes what they come back as.
  function swapWords(index: number): void {
    wordsWanted = index;
    if (wordsTimer !== undefined || wordsShown === index) return;
    now.setAttribute('data-swapping', '');
    wordsTimer = setTimeout(() => {
      wordsTimer = undefined;
      writeWords(wordsWanted);
      now.removeAttribute('data-swapping');
    }, WORDS_OUT_MS);
  }

  // ----- the dial -----

  // The ring round the dial fills over the wait before the next change. A set
  // that does not change by itself has nothing to count.
  function fillRing(waitMs: number): void {
    fill?.cancel();
    if (reduced) return;
    fill = ring.animate(RING_FRAMES, { duration: waitMs, fill: 'forwards', id: 'ring' });
  }

  function stopNudge(): void {
    clearTimeout(nudgeTimer);
    wiggle?.cancel();
  }

  // Until the dial has been turned once, it wiggles a while after each change.
  function nudgeLater(): void {
    clearTimeout(nudgeTimer);
    if (touched || reduced) return;
    nudgeTimer = setTimeout(() => {
      wiggle?.cancel();
      wiggle = dial.animate(NUDGE_FRAMES, { duration: NUDGE_MS, id: 'nudge' });
    }, TIMING.nudgeAfterMs);
  }

  function markTouched(): void {
    if (touched) return;
    touched = true;
    root.setAttribute('data-touched', '');
    stopNudge();
  }

  // ----- a channel change, as the page shows it -----

  function draw(index: number, manual: boolean): void {
    if (manual) manualUntil = performance.now() + TIMING.afterManualMs;
    root.dataset.channel = String(CHANNELS[index].number);
    dial.style.setProperty('--dial-angle', `${channelToAngle(index)}deg`);
    setDialValue(dial, index);
    if (!reduced) flashStatic();
    showClip(index);
    readOut(index);
    swapWords(index);
    // The ring only fills while the set is counting down to a change.
    if (counting()) fillRing(manual ? TIMING.afterManualMs : TIMING.autoMs);
    nudgeLater();
  }

  const controller = createChannels({
    count: CHANNELS.length,
    autoMs: TIMING.autoMs,
    afterManualMs: TIMING.afterManualMs,
    auto: !reduced,
    onTune: draw,
  });

  wireDial(dial, {
    count: CHANNELS.length,
    current: controller.current,
    drag: true,
    onPick(index) {
      markTouched();
      // Picking the channel that is already on is a touch and nothing more.
      if (index !== controller.current()) controller.tune(index, true);
    },
  });
  // A wiggle must not carry on, or start, under the visitor's hand.
  dial.addEventListener('pointerdown', stopNudge);

  for (const clip of clips) clip.addEventListener('playing', loadTheRest, { once: true });

  // ----- counting down to the next change, and when not to -----

  // The set counts down to a change by itself while it is on, in sight, and the
  // visitor is not reading the words under it.
  function counting(): boolean {
    return on && !document.hidden && !pointerOnWords && !keyboardInWords;
  }

  // Starts the wait for the next change afresh, or stops it, as things now stand.
  // A fresh wait is 7 seconds, or what is left of the 20 after a turn by hand if
  // that is longer.
  function recount(): void {
    if (!counting()) {
      controller.stop();
      fill?.cancel();
      return;
    }
    const waitMs = Math.max(TIMING.autoMs, manualUntil - performance.now());
    controller.start(waitMs);
    fillRing(waitMs);
  }

  // Notes whether the visitor is on the words, and recounts if that has changed.
  function reading(change: { pointer?: boolean; keyboard?: boolean }): void {
    const was = counting();
    pointerOnWords = change.pointer ?? pointerOnWords;
    keyboardInWords = change.keyboard ?? keyboardInWords;
    if (counting() !== was) recount();
  }

  now.addEventListener('pointerenter', () => reading({ pointer: true }));
  now.addEventListener('pointerleave', () => reading({ pointer: false }));
  // Focus counts when it is the keyboard's. A link that was clicked keeps focus
  // long after the visitor has moved on, and must not hold the channel for ever.
  now.addEventListener('focusin', (event) => {
    const link = event.target;
    reading({ keyboard: link instanceof Element && link.matches(':focus-visible') });
  });
  now.addEventListener('focusout', (event) => {
    // Focus going on to another of the links is settled by the `focusin` it brings.
    const to = event.relatedTarget;
    if (to instanceof Node && now.contains(to)) return;
    reading({ keyboard: false });
  });

  // ----- switching on, and resting while the page is out of sight -----

  function resume(): void {
    recount();
    play(clips[controller.current()]);
  }

  function rest(): void {
    recount();
    stopNudge();
    clips[controller.current()].pause();
  }

  // Shows channel 1 and starts the set changing by itself. A set switched on
  // while the page is out of sight rests until it is looked at.
  function switchOn(): void {
    on = true;
    controller.tune(0, false);
    if (document.hidden) rest();
    else resume();
  }

  document.addEventListener('visibilitychange', () => {
    if (!on) return;
    if (document.hidden) {
      rest();
    } else {
      // A page that comes back into sight starts a fresh 7 seconds, whatever
      // was left of a wait when it went.
      manualUntil = 0;
      resume();
    }
  });

  return { isOn: () => on, switchOn, clip: clips[0] };
}

// ---------- the opening ----------

// The picture comes on 520 ms into power-on, and the mascot is due 1300 ms into it.
const RAIL_AFTER_PICTURE_MS = 780;
const DONE_AFTER_RAIL_MS = 2000;

// What follows the picture coming on, until the opening is over: the rail is
// revealed, and a little later the opening ends, which is when the note beside
// the dial fades in. The mascot's scene takes the place of this one function.
async function railHandOff(scene: Scene): Promise<void> {
  await scene.wait(RAIL_AFTER_PICTURE_MS);
  scene.lightRail();
  await scene.wait(DONE_AFTER_RAIL_MS);
}

// ---------- everything the page starts ----------

function start(): void {
  const root = document.documentElement;
  // A visitor who asked for less motion gets the finished page with nothing
  // moving by itself: the page's head has marked the request.
  const reduced = root.hasAttribute('data-reduced');
  const rail = find<HTMLElement>('[data-rail]');

  const opening = createPageOpening(
    {
      set: initChannels(reduced),
      rollRail: (delayMs, rampMs) => startRail(rail, { delayMs, rampMs, axis: 'y', reduced }),
    },
    railHandOff,
  );

  // The opening plays only from the dark page the head set up for it. With
  // reduced motion, or if the page gave up waiting for this script and showed
  // itself finished, there is no opening: only the finished page to set going.
  if (root.dataset.stage !== 'off') {
    opening.skip('at once');
    return;
  }

  // A click, a tap or a key at any moment goes straight to the finished page. It
  // is heard on its way down to whatever it landed on, and is not stopped, so a
  // press on the dial or a link finds the finished page and then does its own job.
  const inputs = new AbortController();
  const skip = (): void => opening.skip('eased');
  window.addEventListener('pointerdown', skip, { capture: true, signal: inputs.signal });
  window.addEventListener('keydown', skip, { capture: true, signal: inputs.signal });

  // The opening is for someone watching. A page opened out of sight keeps it for
  // when it is first looked at; a page that goes out of sight part-way is
  // finished there and then, so nothing has queued up by the time it is back.
  let playing = false;
  const play = (): void => {
    playing = true;
    opening.play();
  };
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden && playing) opening.skip('at once');
      else if (!document.hidden && !playing) play();
    },
    { signal: inputs.signal },
  );
  void opening.finished.then(() => inputs.abort());

  if (!document.hidden) play();
}

clearTimeout(window.openingRescue);
try {
  start();
} catch (error) {
  // Whatever went wrong, the page must not be left dark.
  document.documentElement.dataset.stage = 'done';
  throw error;
}
