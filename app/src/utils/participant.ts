// Stable browser id used to limit repeat guest votes from one browser. The
// client sends it to the callable, which hashes it with a server-side secret
// and the poll id before storing the vote key. It is not proof of one person.

const STORAGE_KEY = 'watershed:pollParticipantId';

function randomId(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

export function getParticipantId(): string {
  if (typeof window === 'undefined' || !window.localStorage) return randomId();
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,100}$/.test(existing)) return existing;
    const created = randomId();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Private mode / blocked storage: fall back to a per-session id.
    return randomId();
  }
}
