import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicData } from '../../src/hooks/usePublicData';

const mocks = vi.hoisted(() => ({ forum: [] as Array<{ options: any; next: (s: any) => void; error: (e: unknown) => void }> }));
vi.mock('../../src/features', () => ({ PUBLIC_DOCUMENTS_ENABLED: false }));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/libs/callables', () => ({ listPublicDocumentsFn: vi.fn() }));
vi.mock('../../src/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => name),
  query: vi.fn((name) => name),
  orderBy: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn((q, ...rest) => {
    if (q === 'forumPosts') {
      const [options, next, error] = rest;
      mocks.forum.push({ options, next, error });
    }
    return vi.fn();
  }),
}));

const snapshot = (ids: string[], fromCache: boolean) => ({
  docs: ids.map(id => ({ id, data: () => ({ title: id, status: 'approved' }) })),
  metadata: { fromCache },
});

beforeEach(() => { mocks.forum = []; });

describe('forum listener', () => {
  it('shows cached posts but only reports synced once the server answers', () => {
    const { result } = renderHook(() => usePublicData());
    const listener = mocks.forum[0];
    // Without metadata changes Firestore never reports "cache became server-confirmed".
    expect(listener.options).toEqual({ includeMetadataChanges: true });
    expect(result.current.forumSynced).toBe(false);

    act(() => listener.next(snapshot([], true)));
    expect(result.current.forumSynced).toBe(false);

    act(() => listener.next(snapshot(['post-1'], true)));
    expect(result.current.forumPosts.map(p => p.id)).toEqual(['post-1']);
    expect(result.current.forumSynced).toBe(false);

    act(() => listener.next(snapshot(['post-1'], false)));
    expect(result.current.forumSynced).toBe(true);
  });

  it('restarts a failed listener on retry', () => {
    const { result } = renderHook(() => usePublicData());
    act(() => mocks.forum[0].error(new Error('permission-denied')));
    expect(result.current.forumError).toBe(true);

    act(() => result.current.retryForum());
    expect(mocks.forum).toHaveLength(2);
    expect(result.current.forumError).toBe(false);
    expect(result.current.forumSynced).toBe(false);
    act(() => mocks.forum[1].next(snapshot(['post-1'], false)));
    expect(result.current.forumSynced).toBe(true);
  });
});
