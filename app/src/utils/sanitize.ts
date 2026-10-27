export * from '@watershed/shared/src/sanitize';
// Feature-specific shared contracts (kept in the shared workspace so the
// browser, the callable Functions, and the security rules agree).
export * from '@watershed/shared/src/eventMedia';
export * from '@watershed/shared/src/eventComments';
export * from '@watershed/shared/src/polls';
export * from '@watershed/shared/src/csvSafe';

// // ─── Input Sanitization & Security Utility ───────────────────────────────────
// // Protects against: XSS, HTML injection, script injection, prompt injection,
// // SQL-style injection patterns, and malicious URL schemes.
// // AppCheck + reCAPTCHA to be added later for bot/rate-limit protection.

// // ─── Field Length Limits ──────────────────────────────────────────────────────
// export const LIMITS = {
//   name:             80,
//   userName:         30,
//   email:           254,
//   phone:            20,
//   postTitle:       100,
//   postContent:    1000,
//   replyText:       500,
//   comment:         500,
//   eventTitle:      100,
//   eventLocation:   120,
//   eventDescription:500,
//   eventTime:        30,
//   password:        128,
//   markdown:       8000,
//   bio:            4000,
// };

// // We render Markdown (never raw HTML), so strip tags and neutralize dangerous URIs.
// export function sanitizeMarkdown(input, limit = LIMITS.markdown) {
//   if (typeof input !== 'string') return '';
//   let s = input.replace(/\r\n/g, '\n');
//   s = s.replace(/<\/?[a-z][\s\S]*?>/gi, '');              // drop HTML tags
//   s = s.replace(/\]\(\s*(javascript|data|vbscript):/gi, '](#'); // neutralize bad links
//   s = s.replace(/\n{4,}/g, '\n\n\n');                     // collapse blank lines
//   return enforceLimit(s.trimEnd(), limit);
// }

// // ─── Strip HTML & Dangerous Patterns ─────────────────────────────────────────
// // Removes tags, event handlers, JS protocol, and unicode tricks.
// export function sanitizeText(input) {
//   if (typeof input !== 'string') return '';
//   return input
//     .trim()
//     .replace(/<[^>]*>/g, '')                  // strip all HTML tags
//     .replace(/javascript\s*:/gi, '')           // strip javascript: protocol
//     .replace(/vbscript\s*:/gi, '')             // strip vbscript: protocol
//     .replace(/data\s*:\s*text\/html/gi, '')    // strip data:text/html
//     .replace(/on\w{2,20}\s*=/gi, '')           // strip onerror=, onclick=, etc.
//     .replace(/&#x?[0-9a-f]+;?/gi, '')         // strip HTML entities used to obfuscate
//     .replace(/\u0000/g, '')                    // strip null bytes
//     .normalize('NFC');                         // normalize unicode to canonical form
// }

// // ─── Multiline version (preserves line breaks, for post content/comments) ────
// export function sanitizeMultiline(input) {
//   if (typeof input !== 'string') return '';
//   return input
//     .trim()
//     .replace(/<[^>]*>/g, '')
//     .replace(/javascript\s*:/gi, '')
//     .replace(/vbscript\s*:/gi, '')
//     .replace(/data\s*:\s*text\/html/gi, '')
//     .replace(/on\w{2,20}\s*=/gi, '')
//     .replace(/&#x?[0-9a-f]+;?/gi, '')
//     .replace(/\u0000/g, '')
//     .replace(/[ \t]{4,}/g, '   ')             // collapse excessive horizontal whitespace
//     .normalize('NFC');
// }

// // ─── Email ────────────────────────────────────────────────────────────────────
// export function sanitizeEmail(email) {
//   if (typeof email !== 'string') return '';
//   const cleaned = email.trim().toLowerCase().slice(0, LIMITS.email);
//   const valid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleaned);
//   return valid ? cleaned : '';
// }

// export function sanitizeUserName(userName) {
//   if (typeof userName !== 'string') return '';
//   const cleaned = userName
//     .trim()
//     .toLowerCase()
//     .replace(/\s+/g, '-')
//     .replace(/[^a-z0-9_.-]/g, '')
//     .replace(/[_.-]{2,}/g, '-')
//     .replace(/^[_.-]+|[_.-]+$/g, '')
//     .slice(0, LIMITS.userName);
//   return cleaned.length >= 3 ? cleaned : '';
// }

// // ─── Phone ────────────────────────────────────────────────────────────────────
// export function sanitizePhone(phone) {
//   if (typeof phone !== 'string') return '';
//   return phone
//     .replace(/[^\d\s\-().+]/g, '')           // keep only digits and common phone chars
//     .trim()
//     .slice(0, LIMITS.phone);
// }

// // ─── Google Maps Embed URL ────────────────────────────────────────────────────
// // Only accepts legitimate Google Maps embed URLs.
// export function sanitizeMapUrl(url) {
//   if (!url || typeof url !== 'string') return '';
//   const trimmed = url.trim();
//   if (!trimmed) return '';
//   try {
//     const parsed = new URL(trimmed);
//     // Must be https
//     if (parsed.protocol !== 'https:') return '';
//     // Must be a Google domain
//     if (!parsed.hostname.endsWith('google.com')) return '';
//     // Must be a Maps embed path
//     if (!parsed.pathname.includes('/maps/embed') && !parsed.pathname.includes('/maps/d/embed')) return '';
//     return trimmed;
//   } catch {
//     return '';
//   }
// }

// // ─── Generic URL (for storage links etc.) ────────────────────────────────────
// export function sanitizeUrl(url) {
//   if (!url || typeof url !== 'string') return '';
//   try {
//     const parsed = new URL(url.trim());
//     if (!['https:', 'http:'].includes(parsed.protocol)) return '';
//     return url.trim();
//   } catch {
//     return '';
//   }
// }

// // ─── Enforce max length ───────────────────────────────────────────────────────
// export function enforceLimit(text, limit) {
//   if (typeof text !== 'string') return '';
//   return text.slice(0, limit);
// }

// // ─── Malicious Pattern Detection ──────────────────────────────────────────────
// // Returns an object: { blocked: boolean, reason: string }
// // Checks for XSS, script injection, SQL injection, and prompt injection patterns.
// export function detectMalicious(text) {
//   if (typeof text !== 'string') return { blocked: false, reason: '' };

//   const checks = [
//     // ── XSS & Script Injection ──
//     { pattern: /<script[\s>]/i,                   reason: 'Script tag detected' },
//     { pattern: /javascript\s*:/i,                  reason: 'JavaScript protocol detected' },
//     { pattern: /vbscript\s*:/i,                    reason: 'VBScript protocol detected' },
//     { pattern: /data\s*:\s*text\/html/i,           reason: 'Data URI injection detected' },
//     { pattern: /on\w{2,20}\s*=\s*["']?[\w(]/i,    reason: 'Event handler injection detected' },
//     { pattern: /<iframe[\s>]/i,                    reason: 'Iframe injection detected' },
//     { pattern: /<object[\s>]/i,                    reason: 'Object tag detected' },
//     { pattern: /<embed[\s>]/i,                     reason: 'Embed tag detected' },
//     { pattern: /<form[\s>]/i,                      reason: 'Form injection detected' },
//     { pattern: /document\.(cookie|write|location)/i, reason: 'DOM manipulation detected' },
//     { pattern: /window\.(location|open|eval)/i,    reason: 'Window manipulation detected' },
//     { pattern: /eval\s*\(/i,                       reason: 'eval() detected' },
//     { pattern: /expression\s*\(/i,                 reason: 'CSS expression detected' },

//     // ── SQL Injection Patterns ──
//     { pattern: /'\s*(or|and)\s*'?\d/i,             reason: 'SQL injection pattern detected' },
//     { pattern: /;\s*(drop|alter|truncate|delete)\s+/i, reason: 'SQL injection pattern detected' },
//     { pattern: /union\s+(all\s+)?select\b/i,       reason: 'SQL injection pattern detected' },
//     { pattern: /--\s*$/m,                          reason: 'SQL comment injection detected' },
//     { pattern: /\/\*.*\*\//,                       reason: 'SQL block comment detected' },

//     // ── Prompt Injection ──
//     { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/i, reason: 'Prompt injection detected' },
//     { pattern: /you\s+are\s+now\s+(a|an)\s/i,      reason: 'Prompt injection detected' },
//     { pattern: /forget\s+(everything|all|what|your)/i, reason: 'Prompt injection detected' },
//     { pattern: /new\s+role\s*:/i,                  reason: 'Prompt injection detected' },
//     { pattern: /\[system\]/i,                      reason: 'Prompt injection detected' },
//     { pattern: /system\s*prompt\s*:/i,             reason: 'Prompt injection detected' },
//     { pattern: /###\s*(instruction|system|override)/i, reason: 'Prompt injection detected' },
//     { pattern: /act\s+as\s+(a|an)\s+(different|new|unrestricted)/i, reason: 'Prompt injection detected' },
//     { pattern: /jailbreak/i,                       reason: 'Jailbreak attempt detected' },
//     { pattern: /do\s+anything\s+now/i,             reason: 'Prompt injection detected' },
//   ];

//   for (const { pattern, reason } of checks) {
//     if (pattern.test(text)) {
//       return { blocked: true, reason };
//     }
//   }

//   // ── Spam: excessive repeated characters ──
//   if (/(.)\1{15,}/.test(text)) {
//     return { blocked: true, reason: 'Spam pattern detected' };
//   }

//   // ── Suspicious link in text fields ──
//   if (/(https?:\/\/[^\s]+){3,}/.test(text)) {
//     return { blocked: true, reason: 'Excessive URLs detected' };
//   }

//   return { blocked: false, reason: '' };
// }

// // ─── Composite Sanitizers (used directly in handlers) ─────────────────────────

// export function sanitizeVolunteerForm(data) {
//   return {
//     name:  enforceLimit(sanitizeText(data.name),  LIMITS.name),
//     email: sanitizeEmail(data.email),
//     phone: sanitizePhone(data.phone),
//   };
// }

// export function sanitizeRsvpForm(data) {
//   return {
//     name:     enforceLimit(sanitizeText(data.name),    LIMITS.name),
//     email:    sanitizeEmail(data.email),
//     comments: enforceLimit(sanitizeMultiline(data.comments), LIMITS.comment),
//   };
// }

// export function sanitizePostForm(data) {
//   return {
//     title:   enforceLimit(sanitizeText(data.title),      LIMITS.postTitle),
//     content: enforceLimit(sanitizeMultiline(data.content), LIMITS.postContent),
//   };
// }

// export function sanitizeEventForm(data) {
//   return {
//     title:       enforceLimit(sanitizeText(data.title),       LIMITS.eventTitle),
//     date:        data.date,  // validated by HTML date input
//     time:        enforceLimit(sanitizeText(data.time),        LIMITS.eventTime),
//     location:    enforceLimit(sanitizeText(data.location),    LIMITS.eventLocation),
//     description: enforceLimit(sanitizeMultiline(data.description), LIMITS.eventDescription),
//     // lat/lng are numbers set by map click — not free-text, just range-clamp them
//     lat:  typeof data.lat === 'number' && data.lat >= -90  && data.lat <= 90  ? data.lat  : null,
//     lng:  typeof data.lng === 'number' && data.lng >= -180 && data.lng <= 180 ? data.lng  : null,
//   };
// }

// // Output shape matches the Firestore siteContent/main document.
// export function sanitizeSiteContentForm(raw) {
//   return {
//     mission: sanitizeMarkdown(raw.mission || ''),
//     goals:   sanitizeMarkdown(raw.goals || ''),
//     about: {
//       name:      enforceLimit(sanitizeText(raw.about?.name || ''), LIMITS.name),
//       bio:       sanitizeMarkdown(raw.about?.bio || '', LIMITS.bio),
//       // imageUrl/imagePath are produced by Storage, not user-typed — store as-is
//       imageUrl:  (raw.about?.imageUrl || '').slice(0, 1000),
//       imagePath: (raw.about?.imagePath || '').slice(0, 500),
//     },
//   };
// }
