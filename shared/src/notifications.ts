// Opt-in member notifications: browser push and a once-a-day email digest.
// Shared so the profile settings UI, the callables that store preferences and
// the delivery triggers all agree on topics, defaults and message wording.
import { escapeHtml } from './htmlEscape';

export const SITE_URL = 'https://tillerystreettrail.web.app';

// The digest goes out once a day at 7 PM US Central time.
export const DIGEST_TIME_ZONE = 'America/Chicago';
export const DIGEST_SCHEDULE = '0 19 * * *';
export const DIGEST_TIME_LABEL = '7 PM Central';

export const NOTIFICATION_TOPICS = ['forumReplies', 'forumPosts', 'events'] as const;
export type NotificationTopic = typeof NOTIFICATION_TOPICS[number];
export type NotificationChannels = { push: boolean; digest: boolean };
export type NotificationPreferences = Record<NotificationTopic, NotificationChannels>;

export const NOTIFICATION_TOPIC_LABELS: Record<NotificationTopic, { label: string; description: string }> = {
  forumReplies: {
    label: 'Replies to my forum threads',
    description: 'Someone replies to a post you started or a thread you replied in.',
  },
  forumPosts: {
    label: 'New forum posts',
    description: 'A new discussion is published in the forum.',
  },
  events: {
    label: 'New volunteer events',
    description: 'A new volunteer event is added to the calendar.',
  },
};

// Everything is off until the member opts in.
export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    forumReplies: { push: false, digest: false },
    forumPosts: { push: false, digest: false },
    events: { push: false, digest: false },
  };
}

export function sanitizeNotificationPreferences(input: unknown): NotificationPreferences {
  const clean = defaultNotificationPreferences();
  if (!input || typeof input !== 'object') return clean;
  for (const topic of NOTIFICATION_TOPICS) {
    const value = (input as Record<string, unknown>)[topic];
    if (!value || typeof value !== 'object') continue;
    clean[topic] = {
      push: (value as Record<string, unknown>).push === true,
      digest: (value as Record<string, unknown>).digest === true,
    };
  }
  return clean;
}

export function wantsAnyDigest(preferences: NotificationPreferences): boolean {
  return NOTIFICATION_TOPICS.some(topic => preferences[topic].digest);
}

// FCM registration tokens are long URL-safe strings with a colon separator.
export const MAX_PUSH_TOKENS_PER_USER = 10;
export function isValidPushToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_:-]{100,4096}$/.test(token);
}

/** Members who should hear about a new reply: the thread starter and earlier repliers, never the replier. */
export function replyRecipients(threadParticipantIds: Array<string | null | undefined>, replierId: string | null | undefined): string[] {
  const recipients = new Set<string>();
  for (const id of threadParticipantIds) {
    if (typeof id === 'string' && id && id !== replierId) recipients.add(id);
  }
  return [...recipients];
}

type ReplyLike = { id?: unknown };
/** Replies present after a write that were not present before it, in thread order. */
export function addedReplies<T extends ReplyLike>(before: unknown, after: unknown): T[] {
  const list = (value: unknown) => (Array.isArray(value) ? value : []).filter(
    (reply): reply is T => !!reply && typeof reply === 'object' && typeof (reply as ReplyLike).id === 'string',
  );
  const previous = new Set(list(before).map(reply => reply.id));
  return list(after).filter(reply => !previous.has(reply.id));
}

const clip = (value: unknown, max: number) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export type NotificationMessage = { topic: NotificationTopic; title: string; body: string; link: string };

export function forumReplyMessage(postId: string, postTitle: unknown, replyAuthor: unknown, replyText: unknown): NotificationMessage {
  return {
    topic: 'forumReplies',
    title: `New reply: ${clip(postTitle, 80) || 'Forum thread'}`,
    body: `${clip(replyAuthor, 40) || 'A member'}: ${clip(replyText, 140)}`,
    link: `/forum?post=${encodeURIComponent(postId)}`,
  };
}

export function forumPostMessage(postId: string, postTitle: unknown, postAuthor: unknown): NotificationMessage {
  return {
    topic: 'forumPosts',
    title: `New forum post: ${clip(postTitle, 80) || 'Untitled'}`,
    body: `Started by ${clip(postAuthor, 40) || 'a member'}.`,
    link: `/forum?post=${encodeURIComponent(postId)}`,
  };
}

export function eventMessage(eventId: string, event: { title?: unknown; date?: unknown; time?: unknown; location?: unknown }): NotificationMessage {
  const when = [typeof event.date === 'string' ? event.date : '', clip(event.time, 40)].filter(Boolean).join(' ');
  const where = clip(event.location, 80);
  return {
    topic: 'events',
    title: `New event: ${clip(event.title, 80) || 'Volunteer event'}`,
    body: [when, where].filter(Boolean).join(' · ') || 'See the event page for details.',
    link: `/events/${encodeURIComponent(eventId)}`,
  };
}

/** Only same-site paths may be used as notification click targets. */
export function safeNotificationLink(link: unknown): string {
  return typeof link === 'string' && /^\/(?!\/)[A-Za-z0-9/_?=&%.-]*$/.test(link) ? link : '/';
}

export type DigestItem = { topic: NotificationTopic; title: string; body: string; link: string };

const DIGEST_SECTIONS: Array<{ topic: NotificationTopic; heading: string }> = [
  { topic: 'forumReplies', heading: 'Replies in your threads' },
  { topic: 'forumPosts', heading: 'New forum posts' },
  { topic: 'events', heading: 'New volunteer events' },
];

export const MAX_DIGEST_ITEMS = 50;

export function buildDigestEmail(items: DigestItem[], siteUrl = SITE_URL): { subject: string; text: string; html: string } {
  const shown = items.slice(0, MAX_DIGEST_ITEMS);
  const hidden = items.length - shown.length;
  const settingsUrl = `${siteUrl}/profile`;
  const subject = `WatershedCrew daily digest: ${items.length} update${items.length === 1 ? '' : 's'}`;

  const textParts = ['Here is what happened today at Tillery Fields.', ''];
  const htmlParts = [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px">',
    '<h1 style="font-size:20px;color:#0f766e">WatershedCrew daily digest</h1>',
    '<p>Here is what happened today at Tillery Fields.</p>',
  ];
  for (const { topic, heading } of DIGEST_SECTIONS) {
    const section = shown.filter(item => item.topic === topic);
    if (!section.length) continue;
    textParts.push(heading.toUpperCase());
    htmlParts.push(`<h2 style="font-size:16px;margin-top:24px">${escapeHtml(heading)}</h2><ul style="padding-left:18px">`);
    for (const item of section) {
      const url = `${siteUrl}${safeNotificationLink(item.link)}`;
      textParts.push(`- ${item.title}`, `  ${item.body}`, `  ${url}`);
      htmlParts.push(`<li style="margin-bottom:12px"><a href="${escapeHtml(url)}" style="color:#0f766e;font-weight:bold">${escapeHtml(item.title)}</a><br>${escapeHtml(item.body)}</li>`);
    }
    textParts.push('');
    htmlParts.push('</ul>');
  }
  if (hidden > 0) {
    textParts.push(`…and ${hidden} more on the site.`, '');
    htmlParts.push(`<p>…and ${hidden} more on the site.</p>`);
  }
  textParts.push(`You get this email because you turned on the daily digest. Change or stop it any time: ${settingsUrl}`);
  htmlParts.push(
    `<p style="font-size:12px;color:#6b7280;margin-top:32px">You get this email because you turned on the daily digest. `
    + `<a href="${escapeHtml(settingsUrl)}" style="color:#6b7280">Change or stop it any time</a>.</p></div>`,
  );
  return { subject, text: textParts.join('\n'), html: htmlParts.join('') };
}

export function buildTestEmail(siteUrl = SITE_URL): { subject: string; text: string; html: string } {
  return {
    subject: 'WatershedCrew test email',
    text: `Email delivery for the daily digest is working.\n\n${siteUrl}`,
    html: `<p>Email delivery for the daily digest is working.</p><p><a href="${escapeHtml(siteUrl)}">${escapeHtml(siteUrl)}</a></p>`,
  };
}

export const SENDER_NAME_MAX = 60;
export function sanitizeSenderName(value: unknown): string {
  return clip(typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').replace(/[<>"]/g, '') : '', SENDER_NAME_MAX);
}
