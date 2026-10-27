function cleanIp(value: unknown): string {
  if (typeof value !== 'string') return '';
  let ip = value.trim();
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (!ip || ip.length > 64 || !/^[0-9a-f:.]+$/i.test(ip)) return '';
  return ip.toLowerCase();
}

// Google external load balancers append `<client-ip>,<load-balancer-ip>` to
// any caller-supplied X-Forwarded-For values. The next-to-last entry is the
// boundary-provided client address; earlier entries are untrusted.
export function trustedClientIp(
  forwardedFor: string | string[] | undefined,
  directIp: unknown,
): string {
  const combined = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor || '';
  const chain = combined.split(',').map(value => value.trim()).filter(Boolean);
  if (chain.length >= 2) return cleanIp(chain[chain.length - 2]) || cleanIp(directIp) || 'unknown';
  return cleanIp(directIp) || 'unknown';
}
