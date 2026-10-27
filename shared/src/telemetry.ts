import { sanitizeText } from './sanitize';

const SAFE_EXTRA_KEYS = new Set(['feature']);

export function sanitizeTelemetryUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return '';
  }
}

export function sanitizeTelemetryText(value: unknown, maxLength: number): string {
  const input = String(value || '');
  return input
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, url => {
      const secretStart = url.search(/[?#]/);
      return secretStart >= 0 ? url.slice(0, secretStart) : url;
    })
    .replace(/\b(access_token|id_token|token|api_key|apikey|authorization|password)=([^\s&]+)/gi, '$1=[redacted]')
    .slice(0, maxLength);
}

export function sanitizeTelemetryExtras(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SAFE_EXTRA_KEYS.has(key)) continue;
    if (typeof raw === 'string') safe[key] = sanitizeText(raw).slice(0, 40);
    else if (typeof raw === 'number' && Number.isFinite(raw)) safe[key] = raw;
    else if (typeof raw === 'boolean') safe[key] = raw;
  }
  return safe;
}
