export * from '@watershed/shared/src/mapSafe';
// export const safeColor = (c) =>
//   (typeof c === 'string' &&
//     /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20}|rgba?\([\d.,\s%]+\))$/.test(c.trim()))
//     ? c.trim() : '';

// export const safeNum = (n, d) => (Number.isFinite(+n) ? +n : d);

// export const isSafeImageUrl = (u) => {
//   if (typeof u !== 'string') return false;
//   try { return new URL(u).protocol === 'https:'; }
//   catch { return false; }
// };