// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom/vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import {PhotoLightbox} from './PhotoLightbox';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

/** Authored CSS for an element from injected stylesheets (MUI `sx` / emotion). */
function cssForElement(element: HTMLElement): string {
  const classes = [...element.classList];
  return [...document.styleSheets]
    .flatMap(sheet => {
      try {
        return [...sheet.cssRules];
      } catch {
        return [];
      }
    })
    .filter(
      (rule): rule is CSSStyleRule =>
        'selectorText' in rule &&
        classes.some(cls =>
          (rule as CSSStyleRule).selectorText?.includes(`.${cls}`)
        )
    )
    .map(rule => rule.cssText)
    .join('\n');
}

describe('PhotoLightbox', () => {
  it('places Close preview on the trailing top-end edge and dismisses on activate', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <PhotoLightbox url="https://example.com/photo.jpg" onClose={onClose} />
    );

    const close = screen.getByRole('button', {name: 'Close preview'});
    const css = cssForElement(close);
    const computed = getComputedStyle(close);

    expect(css).toMatch(/inset-inline-end\s*:/);
    expect(css).not.toMatch(/\bleft\s*:\s*16px/);
    expect(computed.left).not.toBe('16px');

    await user.click(close);
    expect(onClose).toHaveBeenCalled();
  });
});
