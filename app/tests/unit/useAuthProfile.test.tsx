import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ listener: null as any, read: vi.fn(), currentUser: null as any }));
vi.mock('firebase/auth', () => ({ onIdTokenChanged: vi.fn((_auth, callback) => { h.listener = callback; return vi.fn(); }) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDocFromServer: h.read }));
vi.mock('../../src/firebase', () => ({ auth: { get currentUser() { return h.currentUser; } }, db: {} }));
vi.mock('../../src/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('../../src/services/accountService', () => ({ syncUserEmail: vi.fn() }));
import { useAuth } from '../../src/hooks/useAuth';
import { needsProfileSetup, profileStatus } from '../../src/auth/profileStatus';

beforeEach(() => {
  h.currentUser = { uid: 'member', email: 'member@example.test', emailVerified: true, getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }) };
  h.read.mockReset();
});

describe('account profile loading', () => {
  it('routes a verified missing profile to setup and refreshes after completion', async () => {
    h.read.mockResolvedValue({ exists: () => false });
    const { result } = renderHook(useAuth);
    await act(() => h.listener(h.currentUser));
    expect(result.current.currentUser.profileStatus).toBe('missing');
    expect(needsProfileSetup(result.current.currentUser)).toBe(true);
    h.read.mockResolvedValue({ exists: () => true, data: () => ({ userName: 'member', accountStatus: 'active' }) });
    await act(() => result.current.refreshUserProfile());
    expect(result.current.currentUser.profileStatus).toBe('active');
    expect(result.current.currentUser.name).toBe('member');
    expect(needsProfileSetup(result.current.currentUser)).toBe(false);
  });

  it('does not treat a failed server read as a missing profile', async () => {
    h.read.mockRejectedValue(new Error('permission denied'));
    const { result } = renderHook(useAuth);
    await act(() => h.listener(h.currentUser));
    expect(result.current.currentUser).toBeNull();
    expect(result.current.accountLoadError).toMatch(/could not load/i);
    expect(needsProfileSetup(result.current.currentUser)).toBe(false);
  });

  it('ignores a profile read that finishes after sign out', async () => {
    let finish: (value: any) => void;
    h.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(useAuth);
    let pending: Promise<void>;
    act(() => { pending = h.listener(h.currentUser); });
    await waitFor(() => expect(h.read).toHaveBeenCalled());
    await act(() => h.listener(null));
    await act(async () => { finish({ exists: () => false }); await pending; });
    expect(result.current.currentUser).toBeNull();
    expect(result.current.authLoading).toBe(false);
  });

  it('does not unmount account forms when the same user refreshes their token', async () => {
    const snapshot = { exists: () => true, data: () => ({ name: 'Member', userName: 'member' }) };
    h.read.mockResolvedValue(snapshot);
    const { result } = renderHook(useAuth);
    await act(() => h.listener(h.currentUser));
    let finish: (value: any) => void;
    h.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    let pending: Promise<void>;
    act(() => { pending = h.listener(h.currentUser); });
    await waitFor(() => expect(h.read).toHaveBeenCalledTimes(2));
    expect(result.current.authLoading).toBe(false);
    expect(result.current.currentUser.userName).toBe('member');
    await act(async () => { finish(snapshot); await pending; });
  });

  it('only offers setup after verification and never for deleting accounts', () => {
    expect(profileStatus(true, { accountStatus: 'deleting' })).toBe('deleting');
    expect(profileStatus(true, { name: 'Member' })).toBe('incomplete');
    expect(profileStatus(true, { userName: 'member' })).toBe('active');
    expect(profileStatus(true, { name: '', userName: 'member' })).toBe('active');
    expect(needsProfileSetup({ emailVerified: false, profileStatus: 'missing' })).toBe(false);
    expect(needsProfileSetup({ emailVerified: true, profileStatus: 'incomplete' })).toBe(true);
    expect(needsProfileSetup({ emailVerified: true, profileStatus: 'deleting' })).toBe(false);
  });
});
