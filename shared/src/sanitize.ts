// Input sanitization and security utilities.

export const LIMITS = {
  name: 80,
  userName: 30,
  email: 254,
  phone: 20,
  postTitle: 100,
  postContent: 1000,
  replyText: 500,
  comment: 500,
  eventTitle: 100,
  eventLocation: 120,
  eventDescription: 500,
  eventTime: 30,
  password: 128,
  markdown: 8000,
  bio: 4000,
  eventComment: 1200,
  eventImageCaption: 200,
  pollQuestion: 200,
  pollDescription: 1000,
  pollNotes: 500,
  pollOption: 120,
  reportDetails: 500,
} as const;

export type MaliciousDetection = {
  blocked: boolean;
  reason: string;
};

type UnknownRecord = Record<string, unknown>;

export type VolunteerFormInput = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
};

export type RsvpFormInput = {
  name?: unknown;
  email?: unknown;
  comments?: unknown;
};

export type PostFormInput = {
  title?: unknown;
  content?: unknown;
};

export type EventFormInput = {
  title?: unknown;
  date?: unknown;
  time?: unknown;
  location?: unknown;
  description?: unknown;
  lat?: unknown;
  lng?: unknown;
};

export type SiteContentFormInput = {
  mission?: unknown;
  goals?: unknown;
  about?: {
    name?: unknown;
    bio?: unknown;
    imageUrl?: unknown;
    imagePath?: unknown;
  } | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

// We render Markdown, never raw HTML, so strip tags and neutralize dangerous URIs.
export function sanitizeMarkdown(input: unknown, limit: number = LIMITS.markdown): string {
  if (typeof input !== 'string') return '';
  let sanitized = input.replace(/\r\n/g, '\n');
  sanitized = sanitized.replace(/<\/?[a-z][\s\S]*?>/gi, '');
  sanitized = sanitized.replace(/\]\(\s*(javascript|data|vbscript):/gi, '](#');
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');
  return enforceLimit(sanitized.trimEnd(), limit);
}

export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/on\w{2,20}\s*=/gi, '')
    .replace(/&#x?[0-9a-f]+;?/gi, '')
    .replace(/\u0000/g, '')
    .normalize('NFC');
}

export function sanitizeMultiline(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/on\w{2,20}\s*=/gi, '')
    .replace(/&#x?[0-9a-f]+;?/gi, '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]{4,}/g, '   ')
    .normalize('NFC');
}

export function sanitizeEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  const cleaned = email.trim().toLowerCase().slice(0, LIMITS.email);
  const valid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleaned);
  return valid ? cleaned : '';
}

export function sanitizeUserName(userName: unknown): string {
  if (typeof userName !== 'string') return '';
  const cleaned = userName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.-]/g, '')
    .replace(/[_.-]{2,}/g, '-')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, LIMITS.userName);
  return cleaned.length >= 3 ? cleaned : '';
}

/** Public default derived only from the email local part, never its domain. */
export function userNameFromEmail(email: unknown): string {
  const clean = sanitizeEmail(email);
  if (!clean) return '';
  const localPart = clean.split('@')[0];
  // Preserve short local parts while satisfying the existing 3-character rule.
  return sanitizeUserName(localPart) || sanitizeUserName(`${localPart}-user`) || 'member';
}

export function sanitizePhone(phone: unknown): string {
  if (typeof phone !== 'string') return '';
  return phone
    .replace(/[^\d\s\-().+]/g, '')
    .trim()
    .slice(0, LIMITS.phone);
}

export function sanitizeMapUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return '';
    if (!parsed.hostname.endsWith('google.com')) return '';
    if (!parsed.pathname.includes('/maps/embed') && !parsed.pathname.includes('/maps/d/embed')) return '';
    return trimmed;
  } catch {
    return '';
  }
}

export function sanitizeUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (!['https:', 'http:'].includes(parsed.protocol)) return '';
    return trimmed;
  } catch {
    return '';
  }
}

export function enforceLimit(text: unknown, limit: number): string {
  if (typeof text !== 'string') return '';
  return text.slice(0, limit);
}

export function detectMalicious(text: unknown): MaliciousDetection {
  if (typeof text !== 'string') return { blocked: false, reason: '' };

  const checks: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
    { pattern: /<script[\s>]/i, reason: 'Script tag detected' },
    { pattern: /javascript\s*:/i, reason: 'JavaScript protocol detected' },
    { pattern: /vbscript\s*:/i, reason: 'VBScript protocol detected' },
    { pattern: /data\s*:\s*text\/html/i, reason: 'Data URI injection detected' },
    { pattern: /on\w{2,20}\s*=\s*["']?[\w(]/i, reason: 'Event handler injection detected' },
    { pattern: /<iframe[\s>]/i, reason: 'Iframe injection detected' },
    { pattern: /<object[\s>]/i, reason: 'Object tag detected' },
    { pattern: /<embed[\s>]/i, reason: 'Embed tag detected' },
    { pattern: /<form[\s>]/i, reason: 'Form injection detected' },
    { pattern: /document\.(cookie|write|location)/i, reason: 'DOM manipulation detected' },
    { pattern: /window\.(location|open|eval)/i, reason: 'Window manipulation detected' },
    { pattern: /eval\s*\(/i, reason: 'eval() detected' },
    { pattern: /expression\s*\(/i, reason: 'CSS expression detected' },
    { pattern: /'\s*(or|and)\s*'?\d/i, reason: 'SQL injection pattern detected' },
    { pattern: /;\s*(drop|alter|truncate|delete)\s+/i, reason: 'SQL injection pattern detected' },
    { pattern: /union\s+(all\s+)?select\b/i, reason: 'SQL injection pattern detected' },
    { pattern: /--\s*$/m, reason: 'SQL comment injection detected' },
    { pattern: /\/\*.*\*\//, reason: 'SQL block comment detected' },
    {
      pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/i,
      reason: 'Prompt injection detected',
    },
    { pattern: /you\s+are\s+now\s+(a|an)\s/i, reason: 'Prompt injection detected' },
    { pattern: /forget\s+(everything|all|what|your)/i, reason: 'Prompt injection detected' },
    { pattern: /new\s+role\s*:/i, reason: 'Prompt injection detected' },
    { pattern: /\[system\]/i, reason: 'Prompt injection detected' },
    { pattern: /system\s*prompt\s*:/i, reason: 'Prompt injection detected' },
    { pattern: /###\s*(instruction|system|override)/i, reason: 'Prompt injection detected' },
    { pattern: /act\s+as\s+(a|an)\s+(different|new|unrestricted)/i, reason: 'Prompt injection detected' },
    { pattern: /jailbreak/i, reason: 'Jailbreak attempt detected' },
    { pattern: /do\s+anything\s+now/i, reason: 'Prompt injection detected' },
  ];

  for (const { pattern, reason } of checks) {
    if (pattern.test(text)) {
      return { blocked: true, reason };
    }
  }

  if (/(.)\1{15,}/.test(text)) {
    return { blocked: true, reason: 'Spam pattern detected' };
  }

  if (/(https?:\/\/[^\s]+){3,}/.test(text)) {
    return { blocked: true, reason: 'Excessive URLs detected' };
  }

  return { blocked: false, reason: '' };
}

export function sanitizeVolunteerForm(data: VolunteerFormInput): { name: string; email: string; phone: string } {
  return {
    name: enforceLimit(sanitizeText(data.name), LIMITS.name),
    email: sanitizeEmail(data.email),
    phone: sanitizePhone(data.phone),
  };
}

export function sanitizeRsvpForm(data: RsvpFormInput): { name: string; email: string; comments: string } {
  return {
    name: enforceLimit(sanitizeText(data.name), LIMITS.name),
    email: sanitizeEmail(data.email),
    comments: enforceLimit(sanitizeMultiline(data.comments), LIMITS.comment),
  };
}

export function sanitizePostForm(data: PostFormInput): { title: string; content: string } {
  return {
    title: enforceLimit(sanitizeText(data.title), LIMITS.postTitle),
    content: enforceLimit(sanitizeMultiline(data.content), LIMITS.postContent),
  };
}

export function sanitizeEventForm(data: EventFormInput): {
  title: string;
  date: unknown;
  time: string;
  location: string;
  description: string;
  lat: number | null;
  lng: number | null;
} {
  return {
    title: enforceLimit(sanitizeText(data.title), LIMITS.eventTitle),
    date: data.date,
    time: enforceLimit(sanitizeText(data.time), LIMITS.eventTime),
    location: enforceLimit(sanitizeText(data.location), LIMITS.eventLocation),
    description: enforceLimit(sanitizeMultiline(data.description), LIMITS.eventDescription),
    lat: typeof data.lat === 'number' && data.lat >= -90 && data.lat <= 90 ? data.lat : null,
    lng: typeof data.lng === 'number' && data.lng >= -180 && data.lng <= 180 ? data.lng : null,
  };
}

export function sanitizeSiteContentForm(raw: SiteContentFormInput | unknown): {
  mission: string;
  goals: string;
  about: {
    name: string;
    bio: string;
    imageUrl: string;
    imagePath: string;
  };
} {
  const source = asRecord(raw);
  const about = asRecord(source.about);
  const imageUrl = typeof about.imageUrl === 'string' ? about.imageUrl : '';
  const imagePath = typeof about.imagePath === 'string' ? about.imagePath : '';

  return {
    mission: sanitizeMarkdown(source.mission),
    goals: sanitizeMarkdown(source.goals),
    about: {
      name: enforceLimit(sanitizeText(about.name), LIMITS.name),
      bio: sanitizeMarkdown(about.bio, LIMITS.bio),
      imageUrl: imageUrl.slice(0, 1000),
      imagePath: imagePath.slice(0, 500),
    },
  };
}
