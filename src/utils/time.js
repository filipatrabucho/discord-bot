const UNITS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000, mo: 2_592_000_000, y: 31_536_000_000 };

/**
 * Parses durations like "30m", "2h", "7d", "1w", "1mo", "1y" or combinations ("1d12h").
 * Returns milliseconds, or null when the text isn't a valid duration.
 */
export function parseDuration(text) {
  if (!text) return null;
  const input = text.toLowerCase().replace(/\s+/g, '');
  const re = /(\d+)(mo|[smhdwy])/g;
  let total = 0;
  let consumed = 0;
  for (const match of input.matchAll(re)) {
    total += Number(match[1]) * UNITS[match[2]];
    consumed += match[0].length;
  }
  return consumed === input.length && total > 0 ? total : null;
}

/** Discord timestamp markdown. */
export const ts = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;
