// Eigenes Symbol-Set „Schachanalyse“: runde, flache Symbole – je eine Farbe plus Weiß
export const CLASS_COLOR = {
  brilliant: '#1fb3a8', great: '#4f8fd6', best: '#6fbf3f', excellent: '#8cc152', good: '#8fa98a', book: '#b08a5e',
  inaccuracy: '#f0b72f', mistake: '#f08a3c', miss: '#e8605a', blunder: '#d93a2f', forced: '#8e979e'
};
const W = '#fff';
const T = (s, size, dx = 0) => `<text x="${12 + dx}" y="${12 + size * .36}" text-anchor="middle" font-size="${size}" font-weight="900" fill="${W}" font-family="-apple-system,'SF Pro Display','Helvetica Neue',Arial,sans-serif" letter-spacing="-.6">${s}</text>`;
const GLYPH = {
  brilliant: T('!!', 12.5),
  great: T('!', 14),
  // vierzackiger Funkelstern
  best: `<path d="M12 4.6c.55 3.6 1.85 4.9 5.4 5.4-3.55.55-4.85 1.85-5.4 5.4-.55-3.55-1.85-4.85-5.4-5.4 3.55-.5 4.85-1.8 5.4-5.4z" fill="${W}"/><circle cx="17.2" cy="16.4" r="1.25" fill="${W}"/>`,
  // Daumen hoch
  excellent: `<path d="M6.4 11h2.6v6.9H6.4z" fill="${W}"/><path d="M10 17.9v-6.6l3.1-4.9c.3-.5.8-.8 1.3-.6.6.2.9.8.8 1.4l-.6 2.6h3.1c1 0 1.7.9 1.5 1.8l-1.1 4.9c-.2.8-.8 1.4-1.6 1.4z" fill="${W}"/>`,
  // Haken
  good: `<path d="M7.2 12.4l3.2 3.2 6.4-6.6" stroke="${W}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  // aufgeschlagenes Buch
  book: `<path d="M5.6 8c2.3-.9 4.4-.7 6.4.7 2-1.4 4.1-1.6 6.4-.7v8.4c-2.3-.8-4.4-.6-6.4.8-2-1.4-4.1-1.6-6.4-.8z" fill="${W}"/><path d="M12 8.8v8.3" stroke="#8a6640" stroke-width="1.1"/>`,
  inaccuracy: T('?!', 11.5),
  mistake: T('?', 14),
  // durchgestrichener Kreis: Chance verpasst
  miss: `<circle cx="12" cy="12" r="5.2" stroke="${W}" stroke-width="2.2" fill="none"/><path d="M8.4 15.6l7.2-7.2" stroke="${W}" stroke-width="2.2" stroke-linecap="round"/>`,
  blunder: T('??', 11.5),
  forced: `<path d="M7.2 12h8.3M12.6 8.6l3.4 3.4-3.4 3.4" stroke="${W}" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
};
export function icon(cls, size = 20) {
  const c = CLASS_COLOR[cls] || '#888';
  return `<svg class="cls-ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="${cls}"><circle cx="12" cy="12" r="11" fill="${c}"/>${(GLYPH[cls] || '').replace(/#8a6640/g, c)}</svg>`;
}
