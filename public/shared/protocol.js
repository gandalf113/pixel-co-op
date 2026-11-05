export const COLORS = ['#5ec85e', '#4fa3e8', '#f2d24b', '#f27bbf'];

export function sanitizeNick(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  const nick = [...clean].slice(0, 12).join('').trim();
  return nick === '' ? null : nick;
}
