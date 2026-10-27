import { describe, it, expect } from 'vitest';
import {
  addedReplies,
  buildDigestEmail,
  defaultNotificationPreferences,
  eventMessage,
  forumReplyMessage,
  isValidPushToken,
  replyRecipients,
  safeNotificationLink,
  sanitizeNotificationPreferences,
  sanitizeSenderName,
  wantsAnyDigest,
  MAX_DIGEST_ITEMS,
} from '@watershed/shared';

describe('notification preferences', () => {
  it('defaults every topic and channel to off', () => {
    const prefs = defaultNotificationPreferences();
    expect(Object.values(prefs).every(channel => !channel.push && !channel.digest)).toBe(true);
    expect(wantsAnyDigest(prefs)).toBe(false);
  });

  it('keeps only known topics and strict booleans', () => {
    const clean = sanitizeNotificationPreferences({
      forumReplies: { push: true, digest: 'yes' },
      events: { push: 1, digest: true },
      admin: { push: true },
      forumPosts: 'on',
    });
    expect(clean).toEqual({
      forumReplies: { push: true, digest: false },
      forumPosts: { push: false, digest: false },
      events: { push: false, digest: true },
    });
    expect(clean).not.toHaveProperty('admin');
    expect(wantsAnyDigest(clean)).toBe(true);
    expect(sanitizeNotificationPreferences(null)).toEqual(defaultNotificationPreferences());
  });
});

describe('reply notification recipients', () => {
  it('notifies the thread starter and earlier repliers once, never the replier', () => {
    expect(replyRecipients(['author', 'a', 'replier', 'a', null, undefined, ''], 'replier')).toEqual(['author', 'a']);
  });

  it('finds replies added by a write, ignoring malformed entries', () => {
    const before = [{ id: 'r1' }, { id: 'r2' }];
    const after = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3', text: 'new' }, null, { text: 'no id' }];
    expect(addedReplies(before, after)).toEqual([{ id: 'r3', text: 'new' }]);
    expect(addedReplies(undefined, [{ id: 'r1' }])).toEqual([{ id: 'r1' }]);
    expect(addedReplies(after, before)).toEqual([]);
  });
});

describe('notification messages', () => {
  it('builds forum reply text that links to the thread', () => {
    const message = forumReplyMessage('post 1', 'Trail cleanup', 'Anonymous 2', `${'x'.repeat(300)}`);
    expect(message.topic).toBe('forumReplies');
    expect(message.title).toBe('New reply: Trail cleanup');
    expect(message.body.startsWith('Anonymous 2: ')).toBe(true);
    expect(message.body.length).toBeLessThanOrEqual(160);
    expect(message.link).toBe('/forum?post=post%201');
  });

  it('summarizes an event with its date, time and place', () => {
    expect(eventMessage('e1', { title: 'Creek planting', date: '2026-11-01', time: '9 AM', location: 'Tillery Fields' })).toEqual({
      topic: 'events',
      title: 'New event: Creek planting',
      body: '2026-11-01 9 AM · Tillery Fields',
      link: '/events/e1',
    });
  });

  it('only allows same-site notification links', () => {
    expect(safeNotificationLink('/events/e1')).toBe('/events/e1');
    expect(safeNotificationLink('/forum?post=abc')).toBe('/forum?post=abc');
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/a"><script>', 42]) {
      expect(safeNotificationLink(bad)).toBe('/');
    }
  });

  it('accepts FCM-shaped tokens only', () => {
    expect(isValidPushToken(`abc:${'A1_-'.repeat(40)}`)).toBe(true);
    expect(isValidPushToken('short')).toBe(false);
    expect(isValidPushToken(`${'a'.repeat(120)}<script>`)).toBe(false);
    expect(isValidPushToken(null)).toBe(false);
  });

  it('strips header-breaking characters from the sender name', () => {
    expect(sanitizeSenderName('Watershed <Crew>\r\nBcc: x@example.com')).toBe('Watershed Crew Bcc: x@example.com');
  });
});

describe('daily digest email', () => {
  it('groups items by topic, escapes HTML, and links back to the site and settings', () => {
    const email = buildDigestEmail([
      { topic: 'events', title: 'New event: <b>Planting</b>', body: 'Sat · Field', link: '/events/e1' },
      { topic: 'forumReplies', title: 'New reply: Trash pickup', body: 'Sam: "see you"', link: '/forum?post=p1' },
    ], 'https://example.test');

    expect(email.subject).toBe('WatershedCrew daily digest: 2 updates');
    expect(email.html.indexOf('Replies in your threads')).toBeLessThan(email.html.indexOf('New volunteer events'));
    expect(email.html).toContain('New event: &lt;b&gt;Planting&lt;/b&gt;');
    expect(email.html).not.toContain('<b>Planting</b>');
    expect(email.html).toContain('href="https://example.test/forum?post=p1"');
    expect(email.text).toContain('https://example.test/events/e1');
    expect(email.text).toContain('https://example.test/profile');
  });

  it('never links off-site and caps long digests', () => {
    const items = Array.from({ length: MAX_DIGEST_ITEMS + 5 }, (_, i) => ({
      topic: 'forumPosts' as const, title: `Post ${i}`, body: 'x', link: i === 0 ? 'https://evil.example' : `/forum?post=p${i}`,
    }));
    const email = buildDigestEmail(items, 'https://example.test');
    expect(email.html).not.toContain('evil.example');
    expect(email.text).toContain('…and 5 more on the site.');
    expect(email.subject).toContain(`${MAX_DIGEST_ITEMS + 5} updates`);
  });
});
