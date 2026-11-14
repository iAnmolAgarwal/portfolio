import { expect, type Page } from '@playwright/test';

// The finished page: what the opening leaves behind. Tests of the page at rest
// start from here, so that they do not have to sit through the opening.

/** True once nothing is still easing into place after the opening was skipped. */
function atRest(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .every((animation) => !(animation instanceof CSSTransition) && animation.id !== 'settle'),
  );
}

/**
 * Opens the page and skips the opening with a key that does nothing else, then
 * waits for the page to come to rest in its finished state.
 */
export async function openFinished(page: Page): Promise<void> {
  await page.goto('/');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'done');
  await expect.poll(() => atRest(page)).toBe(true);
}
