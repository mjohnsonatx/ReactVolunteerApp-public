import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicData } from '../../src/hooks/usePublicData';
import { useRoute } from '../../src/hooks/useRoute';

const mocks = vi.hoisted(() => ({
  enabled: false,
  listDocuments: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('../../src/features', () => ({
  get PUBLIC_DOCUMENTS_ENABLED() { return mocks.enabled; },
}));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/libs/callables', () => ({ listPublicDocumentsFn: mocks.listDocuments }));
vi.mock('../../src/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), where: vi.fn(),
  onSnapshot: vi.fn(() => mocks.unsubscribe),
}));

beforeEach(() => {
  mocks.enabled = false;
  mocks.listDocuments.mockResolvedValue({ data: { documents: [{ id: 'doc-1' }] } });
});

describe('disabled document feature', () => {
  it.each([false, true])('skips public document fetching, including signed-in admins (isAdmin=%s)', (isAdmin) => {
    const { result, unmount } = renderHook(() => usePublicData(isAdmin));
    expect(mocks.listDocuments).not.toHaveBeenCalled();
    expect(result.current.publicDocs).toEqual([]);
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(3);
  });

  it('still loads public documents for local development', async () => {
    mocks.enabled = true;
    const { result } = renderHook(() => usePublicData());
    await waitFor(() => expect(result.current.publicDocs).toEqual([{ id: 'doc-1' }]));
    expect(mocks.listDocuments).toHaveBeenCalledWith({});
  });

  it('replaces direct links and browser-history navigation to disabled documents', () => {
    window.history.replaceState({}, '', '/documents/doc-1?from=bookmark');
    const replace = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useRoute());
    expect(result.current.route.page).toBe('home');
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    expect(replace).toHaveBeenCalledWith(expect.any(Object), '', '/');
    act(() => {
      window.history.pushState({}, '', '/documents');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(window.location.pathname).toBe('/');
    expect(result.current.route.page).toBe('home');
    replace.mockRestore();
  });
});
