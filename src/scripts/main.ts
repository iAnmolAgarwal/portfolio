// The page's one entry script.

import { startRail } from './rail';

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

initRail();
