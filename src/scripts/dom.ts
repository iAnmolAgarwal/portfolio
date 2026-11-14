// Finding the page's own elements. Markup that has gone missing is a mistake worth
// hearing about at once, so a miss throws instead of passing `null` along.

export function find<E extends Element>(selector: string, within: ParentNode = document): E {
  const found = within.querySelector<E>(selector);
  if (found === null) throw new Error(`Nothing on the page matches ${selector}`);
  return found;
}

export function findAll<E extends Element>(selector: string, within: ParentNode = document): E[] {
  const found = Array.from(within.querySelectorAll<E>(selector));
  if (found.length === 0) throw new Error(`Nothing on the page matches ${selector}`);
  return found;
}
