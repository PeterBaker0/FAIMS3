// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import FieldWrapper from './FieldWrapper';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

const HELPER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (classNames.some(name => rule.selectorText.includes(`.${name}`))) {
        parts.push(rule.cssText);
      }
    }
  }
  return parts.join('\n');
}

async function openAdvancedHelper(heading = 'Site notes', helperText?: string) {
  const user = userEvent.setup();
  render(
    <FieldWrapper
      heading={heading}
      advancedHelperText={helperText ?? 'More about this field'}
    >
      <input />
    </FieldWrapper>
  );
  await user.click(screen.getByTestId('advanced-help'));
  return user;
}

describe('FieldWrapper', () => {
  it('renders children', () => {
    render(
      <FieldWrapper>
        <input data-testid="test-input" />
      </FieldWrapper>
    );
    expect(screen.getByTestId('test-input')).toBeInTheDocument();
  });

  it('renders heading when provided', () => {
    render(
      <FieldWrapper heading="Test Field">
        <input />
      </FieldWrapper>
    );
    expect(screen.getByText('Test Field')).toBeInTheDocument();
  });

  it('does not render heading when not provided', () => {
    const {container} = render(
      <FieldWrapper>
        <input />
      </FieldWrapper>
    );
    // Should not have any heading elements
    expect(container.querySelector('h3, h4, h5, h6')).not.toBeInTheDocument();
  });

  it('displays required indicator when required is true', () => {
    render(
      <FieldWrapper heading="Test Field" required={true}>
        <input />
      </FieldWrapper>
    );
    expect(screen.getByTestId('required-indicator')).toBeInTheDocument();
  });

  it('does not display required indicator when required is false', () => {
    render(
      <FieldWrapper heading="Test Field" required={false}>
        <input />
      </FieldWrapper>
    );
    expect(screen.queryByTestId('required-indicator')).toBeNull();
  });

  it('does not display required indicator when not specified', () => {
    render(
      <FieldWrapper heading="Test Field">
        <input />
      </FieldWrapper>
    );
    expect(screen.queryByTestId('required-indicator')).toBeNull();
  });

  it('renders advanced helper text when provided', () => {
    const helperText = 'This is helpful information about the field';
    render(
      <FieldWrapper advancedHelperText={helperText}>
        <input />
      </FieldWrapper>
    );
    expect(screen.getByTestId('advanced-help')).toBeInTheDocument();
  });

  it('does not render helper text when not provided', () => {
    render(
      <FieldWrapper heading="Test Field">
        <input />
      </FieldWrapper>
    );
    // Should not have helper text elements (adjust selector based on implementation)
    expect(screen.queryByTestId('advanced-help')).toBeNull();
  });

  it('renders all props together', () => {
    const helperText = 'Advanced help text';
    render(
      <FieldWrapper
        heading="Complete Field"
        required={true}
        advancedHelperText={helperText}
      >
        <input data-testid="test-input" />
      </FieldWrapper>
    );

    expect(screen.getByText('Complete Field')).toBeInTheDocument();
    expect(screen.getByTestId('required-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-help')).toBeInTheDocument();
    expect(screen.getByTestId('test-input')).toBeInTheDocument();
  });

  it('applies proper accessibility structure', () => {
    render(
      <FieldWrapper heading="Accessible Field" required={true}>
        <input aria-label="test" />
      </FieldWrapper>
    );

    // The heading should be associated with the field
    const heading = screen.getByText('Accessible Field');
    expect(heading).toBeInTheDocument();

    // Required fields should have appropriate ARIA attributes
    // (This test depends on your implementation)
  });

  it('places helper Close on the trailing title edge', async () => {
    await openAdvancedHelper();
    const close = await screen.findByRole('button', {name: 'Close'});
    const title = close.closest('.MuiDialogTitle-root');

    expect(title?.lastElementChild).toBe(close);
    expect(cssTextForElement(close)).not.toMatch(/(?:^|[;{])\s*left:\s*16px/);
  });

  it('dismisses the helper dialog from the labelled Close control', async () => {
    const user = await openAdvancedHelper();
    await user.click(await screen.findByRole('button', {name: 'Close'}));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', {name: 'Close'})
      ).not.toBeInTheDocument();
    });
  });

  it('dismisses the helper dialog on Escape', async () => {
    const user = await openAdvancedHelper();
    await screen.findByRole('button', {name: 'Close'});
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        screen.queryByRole('button', {name: 'Close'})
      ).not.toBeInTheDocument();
    });
  });

  it('opens helper image zoom and returns to the helper after Close preview', async () => {
    const user = await openAdvancedHelper(
      'Site notes',
      `See the example ![Example](${HELPER_PNG})`
    );
    await user.click(await screen.findByRole('img', {name: 'Example'}));

    const lightboxClose = await screen.findByRole('button', {
      name: 'Close preview',
    });
    const css = cssTextForElement(lightboxClose);
    expect(css).toMatch(/inset-inline-end:/);
    expect(css).not.toMatch(/(?:^|[;{])\s*left:\s*16px/);
    expect(css).toMatch(/safe-area-inset-right/);
    expect(css).toMatch(/safe-area-inset-top/);

    await user.click(lightboxClose);

    expect(
      screen.queryByRole('button', {name: 'Close preview'})
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Close'})).toBeInTheDocument();
    expect(screen.getByRole('img', {name: 'Example'})).toBeInTheDocument();
  });
});
