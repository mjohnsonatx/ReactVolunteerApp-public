import { randomBytes } from 'node:crypto';

// Lowercase alphanumeric ids keep Storage object names predictable and make
// them safe to interpolate into `events/{eventId}/{imageId}.{ext}` paths.
export function randomId(length = 20): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
