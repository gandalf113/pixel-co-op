import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimalna atrapa DOM. `dataset` i `children` są celowo tylko do odczytu —
// przypisanie do nich w module ES (strict mode) ma wywalić test, a nie przejść
// cicho i zepsuć stronę dopiero w przeglądarce.
function makeNode(tag) {
  const node = {
    tagName: tag.toUpperCase(), style: {}, listeners: {},
    textContent: '', value: '', className: '',
    append(...kids) { for (const k of kids) if (k != null) node.children.push(k); },
    replaceChildren(...kids) { node.children.length = 0; node.append(...kids); },
    addEventListener(name, fn) { node.listeners[name] = fn; },
    focus() { node.focused = true; },
    classList: { toggle: (cls, on) => { node.classes.set(cls, !!on); } },
  };
  Object.defineProperty(node, 'children', { value: [], writable: false });
  Object.defineProperty(node, 'dataset', { value: {}, writable: false });
  Object.defineProperty(node, 'classes', { value: new Map(), writable: false });
  Object.defineProperty(node, 'lastChild', { get: () => node.children.at(-1) });
  return node;
}

const root = makeNode('div');
globalThis.document = { getElementById: () => root, createElement: makeNode };
globalThis.location = { href: 'https://obrzyn.online/?r=AAAA', protocol: 'https:', host: 'obrzyn.online' };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => {} } }, configurable: true });

const ui = await import('../public/client/ui.js');

const texts = (node, out = []) => {
  if (node.textContent) out.push(node.textContent);
  for (const c of node.children) typeof c === 'string' ? out.push(c) : texts(c, out);
  return out;
};
const flat = (node, out = []) => {
  out.push(node);
  for (const c of node.children) if (typeof c !== 'string') flat(c, out);
  return out;
};

beforeEach(() => root.replaceChildren());

test('formularz LAN nie pyta o kod pokoju', () => {
  ui.showJoinForm({ nick: 'Olek', rooms: false }, () => {});
  const inputs = flat(root).filter((n) => n.tagName === 'INPUT');
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].value, 'Olek');
});

test('formularz w trybie pokoi ma pole kodu i podaje kod wielkimi literami', () => {
  const got = [];
  ui.showJoinForm({ nick: 'Olek', room: 'ab3d', rooms: true }, (nick, code) => got.push([nick, code]));
  const inputs = flat(root).filter((n) => n.tagName === 'INPUT');
  assert.equal(inputs.length, 2);
  const form = flat(root).find((n) => n.tagName === 'FORM');
  form.listeners.submit({ preventDefault() {} });
  assert.deepEqual(got, [['Olek', 'AB3D']]);
});

test('puste pole kodu znaczy nowy pokój, pusty nick nie wysyła niczego', () => {
  const got = [];
  ui.showJoinForm({ nick: '', room: '', rooms: true }, (nick, code) => got.push([nick, code]));
  const form = flat(root).find((n) => n.tagName === 'FORM');
  form.listeners.submit({ preventDefault() {} });
  assert.deepEqual(got, [], 'bez nicku nie dołączamy');
  flat(root).filter((n) => n.tagName === 'INPUT')[0].value = 'Piotr';
  form.listeners.submit({ preventDefault() {} });
  assert.deepEqual(got, [['Piotr', null]]);
});

test('link do pokoju jest absolutny i zawiera kod', () => {
  assert.equal(ui.roomLink('AB3D'), 'https://obrzyn.online/?r=AB3D');
});

test('leaderboard bez danych nie renderuje panelu', () => {
  assert.equal(ui.leaderboardPanel(null), null);
  assert.equal(ui.leaderboardPanel({ runs: [], players: [] }), null);
});

test('leaderboard pokazuje przebiegi i przełącza się na graczy', () => {
  const data = {
    runs: [{ wave: 12, timeS: 845, kills: 512, difficulty: 3, players: ['Piotr', 'Olek'] }],
    players: [{ nick: 'Piotr', kills: 1203, games: 14, bestWave: 12 }],
  };
  const panel = ui.leaderboardPanel(data);
  const shown = texts(panel).join(' ');
  assert.match(shown, /12/);
  assert.match(shown, /14:05/, 'czas sformatowany');
  assert.match(shown, /trudny/);
  assert.match(shown, /Piotr, Olek/);
  const tab = flat(panel).find((n) => n.tagName === 'BUTTON' && n.dataset.k === 'players');
  tab.listeners.click();
  assert.match(texts(panel).join(' '), /1203/);
});

test('lobby pokoju pokazuje kod i link zamiast adresów LAN', () => {
  ui.showLobby(
    { room: 'AB3D', players: [{ id: 'p1', nick: 'A', color: '#fff', host: true, ultKind: 'heal' }], difficulty: 2, addresses: [], youAreHost: true },
    { difficulties: [{ name: 'x', desc: 'y' }, { name: 'normalny', desc: 'opis' }], ultimates: { heal: { name: 'Lecz', blurb: 'b', tiers: [{ desc: 'd' }] } }, icons: {}, myId: 'p1', onUlt() {}, onDifficulty() {}, onStart() {} },
  );
  const shown = texts(root).join(' ');
  assert.match(shown, /AB3D/);
  assert.match(shown, /https:\/\/obrzyn\.online\/\?r=AB3D/);
  assert.match(shown, /Zaproś/);
});

test('ekran wyników pokazuje upadki i leaderboard', () => {
  ui.showResults(
    { wave: 7, timeS: 300, players: [{ nick: 'A', color: '#fff', kills: 10, downs: 2 }] },
    false, () => {},
    { runs: [{ wave: 9, timeS: 400, kills: 99, difficulty: 2, players: ['B'] }], players: [] },
  );
  const shown = texts(root).join(' ');
  assert.match(shown, /Upadki/);
  assert.match(shown, /Leaderboard/);
  assert.match(shown, /Czekam na hosta/);
});


test('ekran nicku ma tylko pole nicku i nie wysyła pustego', () => {
  const got = [];
  ui.showNickScreen({ nick: '' }, (n) => got.push(n));
  const inputs = flat(root).filter((n) => n.tagName === 'INPUT');
  assert.equal(inputs.length, 1);
  const form = flat(root).find((n) => n.tagName === 'FORM');
  form.listeners.submit({ preventDefault() {} });
  assert.deepEqual(got, []);
  inputs[0].value = ' Olek ';
  form.listeners.submit({ preventDefault() {} });
  assert.deepEqual(got, ['Olek']);
});

test('ekran główny: wiersze pokoi, mecz w toku i pełny są nieklikalne', () => {
  const joined = [];
  const rooms = [
    { code: 'AAAA', players: 2, maxPlayers: 4, inGame: false, wave: 0, ageS: 5 },
    { code: 'BBBB', players: 3, maxPlayers: 4, inGame: true, wave: 7, ageS: 50 },
    { code: 'CCCC', players: 4, maxPlayers: 4, inGame: false, wave: 0, ageS: 80 },
  ];
  ui.showHome({ nick: 'Olek', rooms }, { onJoin: (c) => joined.push(c), onNew() {}, onControls() {}, onChangeNick() {} });
  const shown = texts(root).join(' ');
  assert.match(shown, /2 \/ 4 graczy/);
  assert.match(shown, /mecz w toku · fala 7/);
  const rows = flat(root).filter((n) => String(n.className).startsWith('room-row'));
  assert.equal(rows.length, 3);
  assert.ok(rows[0].listeners.click);
  assert.equal(rows[1].listeners.click, undefined);
  assert.equal(rows[2].listeners.click, undefined);
  rows[0].listeners.click();
  assert.deepEqual(joined, ['AAAA']);
  assert.match(shown, /Nowy pokój/);
  assert.match(shown, /Sterowanie/);
  assert.match(shown, /zmień nick/);
});

test('ekran główny: pusta lista, setRooms i komunikat', () => {
  const view = ui.showHome({ nick: 'O', rooms: [], message: 'Pokój jest już zamknięty' }, { onJoin() {}, onNew() {}, onControls() {}, onChangeNick() {} });
  assert.match(texts(root).join(' '), /brak otwartych pokojów — załóż własny/);
  assert.match(texts(root).join(' '), /Pokój jest już zamknięty/);
  view.setRooms([{ code: 'ZZZZ', players: 1, maxPlayers: 4, inGame: false, wave: 0, ageS: 1 }]);
  assert.match(texts(root).join(' '), /ZZZZ/);
});

test('ekran główny w trybie LAN: bez listy i bez "Nowy pokój", GRAJ dołącza', () => {
  let joined = 0;
  ui.showHome({ nick: 'O', lan: true }, { onJoin() {}, onNew: () => { joined++; }, onControls() {}, onChangeNick() {} });
  const shown = texts(root).join(' ');
  assert.doesNotMatch(shown, /Otwarte pokoje|brak otwartych|Nowy pokój/);
  assert.match(shown, /GRAJ/);
  assert.match(shown, /Sterowanie/);
  flat(root).find((n) => n.tagName === 'BUTTON' && texts(n).includes('GRAJ')).listeners.click();
  assert.equal(joined, 1);
});

// V3-K-06: GRAJ = pierwszy pokoj z miejscem, bez takiego = nowy; stopka z pulsem, porada rotuje, co nowego, bestiariusz.
test('ekran główny: GRAJ wchodzi do pierwszego wolnego pokoju, a bez wolnych zakłada nowy', () => {
  const got = [];
  const cb = { onJoin() {}, onNew() {}, onControls() {}, onChangeNick() {}, onPlay: (c) => got.push(c) };
  const view = ui.showHome({ nick: 'O', rooms: [
    { code: 'FULL', players: 4, maxPlayers: 4, inGame: false, wave: 0, ageS: 1 },
    { code: 'GAME', players: 1, maxPlayers: 4, inGame: true, wave: 3, ageS: 1 },
    { code: 'OPEN', players: 1, maxPlayers: 4, inGame: false, wave: 0, ageS: 1 },
  ] }, cb);
  const play = () => flat(root).find((n) => n.tagName === 'BUTTON' && texts(n).includes('GRAJ')).listeners.click();
  const shown = texts(root).join(' ');
  play();
  view.setRooms([]);
  play();
  view.setRooms(null);
  play();
  assert.deepEqual(got, ['OPEN', null, null]);
  assert.match(shown, /w toku/);
  assert.match(shown, /Bestiariusz/);
  assert.match(shown, /Ślimak/);
  assert.match(shown, /co nowego/);
  assert.match(shown, /Głośność/);
  assert.match(shown, /Pełny ekran/);
});

test('ekran główny: wizytówka z wynikami gracza, miejsce poza top 6, puls serwera i rotacja porady', () => {
  const players = Array.from({ length: 9 }, (_, i) => ({ nick: `g${i}`, kills: 100 - i, games: 2, bestWave: 9 - i }));
  const view = ui.showHome({ nick: 'g8', rooms: [], version: '0.16.0', online: { players: 3, rooms: 1 },
    leaderboard: { runs: [{ wave: 5, timeS: 60, kills: 10, difficulty: 2, players: ['g8'] }], players } },
  { onJoin() {}, onNew() {}, onControls() {}, onChangeNick() {} });
  let shown = texts(root).join(' ');
  assert.match(shown, /online: 3 · pokoje: 1/);
  assert.match(shown, /v0\.16\.0/);
  // statystyki z leaderboardu: najd. fala 1, zabojstw 92, partii 2
  assert.match(shown, /\b92\b/);
  const tipBefore = flat(root).find((n) => n.className === 'tip').textContent;
  view.tick();
  const tipAfter = flat(root).find((n) => n.className === 'tip').textContent;
  assert.notEqual(tipBefore, tipAfter);
  view.setOnline(null);
  shown = texts(root).join(' ');
  assert.doesNotMatch(shown, /online:/);
  // zakladka Gracze: 6 wierszy + "Ty: miejsce 9"
  const tab = flat(root).find((n) => n.tagName === 'BUTTON' && texts(n).includes('Gracze'));
  tab.listeners.click();
  shown = texts(root).join(' ');
  assert.match(shown, /Ty: miejsce 9/);
  assert.doesNotMatch(shown, /\bg7\b/);
});

// V3-K-08 (B2): POKOJE jako osobna sekcja z licznikiem, karty z wiekiem i Wejdz, ustawienia pod przyciskiem.
test('ekran główny B2: sekcja POKOJE z licznikiem, karty z wiekiem, ustawienia rozwijane', () => {
  const view = ui.showHome({ nick: 'O', rooms: [
    { code: 'AAAA', players: 2, maxPlayers: 4, inGame: false, wave: 0, ageS: 40 },
    { code: 'BBBB', players: 3, maxPlayers: 4, inGame: true, wave: 7, ageS: 360 },
  ] }, { onJoin() {}, onNew() {}, onControls() {}, onChangeNick() {} });
  let shown = texts(root).join(' ');
  assert.match(shown, /POKOJE/);
  assert.match(shown, /2 otwartych · 1 z miejscem/);
  assert.match(shown, /2 \/ 4 graczy · lobby · 40 s temu/);
  assert.match(shown, /mecz w toku · fala 7 · 6 min temu/);
  assert.match(shown, /Wejdź/);
  assert.match(shown, /\+ Nowy pokój/);
  const settings = flat(root).find((n) => n.className === 'settings');
  assert.equal(settings.hidden, true);
  flat(root).find((n) => n.tagName === 'BUTTON' && texts(n).includes('Ustawienia')).listeners.click();
  assert.equal(settings.hidden, false);
  view.setRooms([{ code: 'CCCC', players: 1, maxPlayers: 4, inGame: false, wave: 0, ageS: 1 }]);
  shown = texts(root).join(' ');
  assert.match(shown, /1 otwarty · 1 z miejscem/);
  assert.equal(ui.formatAge(NaN), '');
});

test('poligon: panel dokowany z boku, setPressed nie wywala sie bez kontekstu 2D', () => {
  const view = ui.showControls(() => {});
  assert.equal(root.classes.get('side'), true);
  view.setPressed(new Set(['W']));
  ui.hideAll();
  assert.equal(root.classes.get('side'), false);
});

test('pauza ma przycisk Sterowanie, a ekran sterowania wraca przyciskiem', () => {
  let opened = 0;
  ui.showPause({ onResume() {}, onFullscreen() {}, onLeave() {}, onControls: () => { opened++; } });
  const btn = flat(root).find((n) => n.tagName === 'BUTTON' && texts(n).includes('Sterowanie'));
  assert.ok(btn);
  btn.listeners.click();
  assert.equal(opened, 1);
  let back = 0;
  ui.showControls(() => { back++; });
  flat(root).find((n) => n.tagName === 'BUTTON' && texts(n).includes('Wróć')).listeners.click();
  assert.equal(back, 1);
});
