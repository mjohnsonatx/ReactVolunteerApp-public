export const safeColor = (color: unknown): string =>
  typeof color === 'string' &&
  /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20}|rgba?\([\d.,\s%]+\))$/.test(color.trim())
    ? color.trim()
    : '';

export const safeNum = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const isSafeImageUrl = (url: unknown): boolean => {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};
