/**
 * Vitest setup.
 *
 * Runs once per test file, before the file's own imports are evaluated for the first test.
 * Kept deliberately small: anything that changes global behaviour (fake timers, network
 * stubs) belongs in the individual test file where it is visible, not hidden here.
 */

import '@testing-library/jest-dom/vitest';

import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // jsdom keeps localStorage between tests in the same file, which leaks settings between
  // cases. Clearing it is cheap and removes a whole class of confusing failures.
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// jsdom implements neither of these, and both are called by modules the tests import.
// They are stubbed rather than left undefined so that a test which forgets to stub them
// fails on the assertion it was written for, not on a TypeError three frames deep.
if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!('scrollTo' in window)) {
  Object.defineProperty(window, 'scrollTo', { writable: true, value: () => {} });
}
