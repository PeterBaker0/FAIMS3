// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom/vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactNode} from 'react';
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

vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({
    children,
    onPanningStart,
  }: {
    children: ReactNode;
    onPanningStart?: () => void;
  }) => (
    <div
      data-testid="lightbox-zoom-surface"
      onPointerDown={() => onPanningStart?.()}
    >
      {children}
    </div>
  ),
  TransformComponent: ({children}: {children: ReactNode}) => (
    <div>{children}</div>
  ),
}));

/** Emotion/MUI `sx` rules applied to `element`. */
function cssTextForElement(element: Element): string {
  const classNames = [...element.classList];
  const parts: string[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    collectMatchingRules(rules, classNames, parts);
  }
  return parts.join('\n');
}

function collectMatchingRules(
  rules: CSSRuleList,
  classNames: string[],
  parts: string[]
) {
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) {
      collectMatchingRules(rule.cssRules, classNames, parts);
      continue;
    }
    if (!(rule instanceof CSSStyleRule)) continue;
    if (classNames.some(name => rule.selectorText.includes(`.${name}`))) {
      parts.push(rule.cssText);
    }
  }
}

function renderLightbox(onClose = vi.fn()) {
  render(
    <PhotoLightbox url="https://example.com/photo.png" onClose={onClose} />
  );
  return {onClose};
}

function lightboxContent() {
  return screen.getByRole('button', {name: 'Close preview'}).parentElement;
}

describe('PhotoLightbox', () => {
  it('places Close preview on the top-end edge, not left', () => {
    renderLightbox();
    const close = screen.getByRole('button', {name: 'Close preview'});
    const css = cssTextForElement(close);

    expect(css).toMatch(/inset-inline-end:/);
    expect(css).toMatch(/safe-area-inset-right/);
    expect(css).toMatch(/safe-area-inset-top/);
    expect(css).toMatch(/max\(56px/);
    expect(css).toMatch(/z-index:\s*2/);
    expect(css).not.toMatch(/(?:^|[;{])\s*left:\s*16px/);
  });

  it('keeps the Close preview label, colour, and shadow', () => {
    renderLightbox();
    const close = screen.getByRole('button', {name: 'Close preview'});
    const css = cssTextForElement(close);

    expect(close).toHaveAttribute('aria-label', 'Close preview');
    expect(css).toMatch(/box-shadow:/);
    expect(css).toMatch(/color:/);
  });

  it('dismisses from the labelled Close preview control', async () => {
    const user = userEvent.setup();
    const {onClose} = renderLightbox();

    await user.click(screen.getByRole('button', {name: 'Close preview'}));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape', async () => {
    const user = userEvent.setup();
    const {onClose} = renderLightbox();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('dismisses on backdrop click when the user did not pan', () => {
    const {onClose} = renderLightbox();

    fireEvent.click(lightboxContent()!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss on the click that ends a pan, then dismisses on the next backdrop click', () => {
    const {onClose} = renderLightbox();
    const content = lightboxContent()!;

    fireEvent.pointerDown(screen.getByTestId('lightbox-zoom-surface'));
    fireEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(content);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
