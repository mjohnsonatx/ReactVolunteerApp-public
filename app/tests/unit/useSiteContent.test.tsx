import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE_CONTENT } from '../../src/siteContent';

const h = vi.hoisted(() => ({
  next: null as null | ((snapshot: any) => void),
  fail: null as null | ((error: unknown) => void),
  unsubscribe: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'siteContent/main' })),
  onSnapshot: vi.fn((_reference, next, fail) => {
    h.next = next;
    h.fail = fail;
    return h.unsubscribe;
  }),
}));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/utils/logError', () => ({ logError: h.logError }));

import { useSiteContent } from '../../src/hooks/useSiteContent';

beforeEach(() => {
  h.next = null;
  h.fail = null;
  h.unsubscribe.mockClear();
  h.logError.mockClear();
});

describe('useSiteContent', () => {
  it('starts with the current public content before Firestore responds', () => {
    const { result } = renderHook(() => useSiteContent());

    expect(result.current).toEqual(DEFAULT_SITE_CONTENT);
  });

  it('replaces defaults with saved Firestore content and retains missing About Me fields', () => {
    const { result } = renderHook(() => useSiteContent());

    act(() => h.next?.({
      exists: () => true,
      data: () => ({ mission: 'Saved mission', goals: '- Saved goal', about: { name: 'River Lead' } }),
    }));

    expect(result.current).toEqual({
      mission: 'Saved mission',
      goals: '- Saved goal',
      about: { name: 'River Lead', bio: '', imageUrl: '', imagePath: '' },
    });
  });

  it('keeps the public defaults when the shared document does not exist', () => {
    const { result } = renderHook(() => useSiteContent());

    act(() => h.next?.({ exists: () => false }));

    expect(result.current).toEqual(DEFAULT_SITE_CONTENT);
  });
});
