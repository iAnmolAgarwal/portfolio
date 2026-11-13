// The page's one script. Each part of the page that moves is set up by its own
// function, and they are all called from the bottom of this file.

import { CHANNELS, TIMING } from '../data/site';
import { createChannels } from './channels';
import { channelToAngle, setDialValue, wireDial } from './dial';
import { startRail } from './rail';

type Timer = ReturnType<typeof setTimeout>;

function find<E extends Element>(selector: string, within: ParentNode = document): E {
  const found = within.querySelector<E>(selector);
  if (found === null) throw new Error(`Nothing on the page matches ${selector}`);
  return found;
}

// ---------- channels and the dial ----------

// The words under the set fade out for this long before they are replaced.
const WORDS_OUT_MS = 240;
const NUDGE_MS = 1100;

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

function initChannels(): void {
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

  // One of each at a time, however fast the channel is changed.
  let flash: Animation | undefined;
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

  // If a clip cannot play, its poster is what the screen shows.
  function play(clip: HTMLVideoElement): void {
    if (clip.error !== null) clip.load();
    clip.play().catch(() => undefined);
  }

  // Puts one channel's clip on the screen, playing from its start. This is called
  // as the static begins, so the swap and the clip's first frame replacing its
  // poster both happen behind the static.
  function showClip(index: number): void {
    clips.forEach((clip, at) => {
      clip.toggleAttribute('data-on', at === index);
      if (at !== index) clip.pause();
      // A clip that has not played yet is left alone, so it keeps its poster.
      if (clip.currentTime > 0) clip.currentTime = 0;
    });
    if (!document.hidden) play(clips[index]);
  }

  // The first channel's clip loads first. The others are fetched once one clip is
  // playing, so that each is ready by the time its channel comes round.
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
    links.replaceChildren(
      ...channel.links.map((link) => {
        const a = document.createElement('a');
        a.className = 'link';
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = link.label;
        return a;
      }),
    );
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

  // The ring round the dial fills over the wait before the next change.
  function fillRing(waitMs: number): void {
    fill?.cancel();
    fill = ring.animate(RING_FRAMES, { duration: waitMs, fill: 'forwards', id: 'ring' });
  }

  function stopNudge(): void {
    clearTimeout(nudgeTimer);
    wiggle?.cancel();
  }

  // Until the dial has been turned once, it wiggles a while after each change.
  function nudgeLater(): void {
    clearTimeout(nudgeTimer);
    if (touched) return;
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
    root.dataset.channel = String(CHANNELS[index].number);
    dial.style.setProperty('--dial-angle', `${channelToAngle(index)}deg`);
    setDialValue(dial, index);
    flashStatic();
    showClip(index);
    readOut(index);
    swapWords(index);
    fillRing(manual ? TIMING.afterManualMs : TIMING.autoMs);
    nudgeLater();
  }

  const controller = createChannels({
    count: CHANNELS.length,
    autoMs: TIMING.autoMs,
    afterManualMs: TIMING.afterManualMs,
    auto: true,
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
  // A wiggle must not carry on under the visitor's hand.
  dial.addEventListener('pointerdown', () => wiggle?.cancel());

  for (const clip of clips) clip.addEventListener('playing', loadTheRest, { once: true });

  // ----- switching on, and resting while the page is out of sight -----

  // Starts the wait for the next change by itself: a fresh one every time.
  function resume(): void {
    controller.start();
    fillRing(TIMING.autoMs);
    play(clips[controller.current()]);
  }

  function rest(): void {
    controller.stop();
    fill?.cancel();
    stopNudge();
    clips[controller.current()].pause();
  }

  // Shows channel 1 and starts the set changing by itself.
  function switchOn(): void {
    on = true;
    controller.tune(0, false);
    if (!document.hidden) resume();
  }

  document.addEventListener('visibilitychange', () => {
    if (!on) return;
    if (document.hidden) rest();
    else resume();
  });

  switchOn();
}

// ---------- the rail of results ----------

// Sets the rail of results rolling, or leaves it as a list to scroll by hand for
// a visitor who asked for less motion.
function initRail(): void {
  const rail = document.querySelector<HTMLElement>('[data-rail]');
  if (rail === null) return;
  startRail(rail, {
    delayMs: 0,
    rampMs: 600,
    axis: 'y',
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
}

// ---------- everything the page starts ----------

initRail();
initChannels();
