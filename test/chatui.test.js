// Interfejs czatu: panel w pokoju, naklada w trakcie gry, wejscie "Ogladaj" i przycisk "Opusc pokoj".
import test from 'node:test';
import assert from 'node:assert/strict';
import { balance } from './helpers.js';

function makeNode(tag) {
  const node = {
    tagName: tag.toUpperCase(), style: {}, listeners: {},
    textContent: '', value: '', className: '', placeholder: '',
    append(...kids) { for (const k of kids) if (k != null) node.children.push(k); },
    replaceChildren(...kids) { node.children.length = 0; node.append(...kids); },
    addEventListener(name, fn) { node.listeners[name] = fn; },
    focus() { node.focused = true; },
    classList: {
      toggle: (cls, on) => { node.classes.set(cls, !!on); },
      contains: (cls) => !!node.classes.get(cls),
    },
  };
  Object.defineProperty(node, 'children', { value: [], writable: false });
  Object.defineProperty(node, 'dataset', { value: {}, writable: false });
  Object.defineProperty(node, 'classes', { value: new Map(), writable: false });
  return node;
}
const root = makeNode('div');
globalThis.document = { getElementById: () => root, createElement: makeNode, documentElement: {} };
globalThis.location = { href: 'https://obrzyn.online/?r=AAAA', protocol: 'https:', host: 'obrzyn.online' };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => {} } }, configurable: true });
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };

const ui = await import('../public/client/ui.js');
const i18n = await import('../public/client/i18n.js');

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
const lobbyMsg = (over = {}) => ({
  difficulty: 2, youAreHost: true, room: 'ABCD',
  players: [{ id: 1, nick: 'A', color: '#fff', host: true, ultKind: 'heal', ultKind2: 'frenzy' }],
  ...over,
});
const lobbyArgs = (over = {}) => ({
  difficulties: balance.difficulty, ultimates: balance.ultimate.kinds, icons: {}, myId: 1,
  onUlt() {}, onDifficulty() {}, onStart() {}, ...over,
});

test('pokoj ma widoczny panel czatu z historia', () => {
  i18n.setLang('pl');
  const log = [
    { n: 1, from: 'A', id: 'p1', role: 'player', text: 'siema' },
    { n: 2, system: 'chat.joined', vars: { nick: 'B' } },
  ];
  ui.showLobby(lobbyMsg(), lobbyArgs({ chatLog: log, onChat: () => true }));
  const panel = flat(root).find((n) => n.className === 'card chat');
  assert.ok(panel, 'panel czatu jest w pokoju');
  const shown = texts(panel);
  assert.ok(shown.includes('CZAT'), 'z naglowkiem');
  assert.ok(shown.includes('siema'), 'z trescia wiadomosci');
  assert.ok(shown.includes('A: '), 'z nickiem nadawcy');
  assert.ok(shown.includes('B wszedł do pokoju'), 'wpis systemowy przetlumaczony z klucza');
  assert.ok(flat(panel).some((n) => n.className === 'chat-input'), 'z polem do pisania');
});

test('wyslanie wiadomosci woła onChat i czysci pole; pusta nie leci', () => {
  let sent = null;
  const chat = ui.chatPanel({ log: [], onSend: (txt) => { sent = txt; return true; } });
  const input = flat(chat.node).find((n) => n.className === 'chat-input');
  const form = flat(chat.node).find((n) => n.tagName === 'FORM');
  input.value = '   ';
  form.listeners.submit({ preventDefault() {} });
  assert.equal(sent, null, 'sama spacja nie leci');
  input.value = 'hej';
  form.listeners.submit({ preventDefault() {} });
  assert.equal(sent, 'hej');
  assert.equal(input.value, '', 'pole wyczyszczone po wyslaniu');
});

test('gdy serwer odmowi (limit tempa), tresc zostaje w polu', () => {
  const chat = ui.chatPanel({ log: [], onSend: () => false });
  const input = flat(chat.node).find((n) => n.className === 'chat-input');
  const form = flat(chat.node).find((n) => n.tagName === 'FORM');
  input.value = 'za szybko';
  form.listeners.submit({ preventDefault() {} });
  assert.equal(input.value, 'za szybko', 'nie gubimy tego, co gracz napisal');
});

test('wiadomosc widza jest oznaczona i odrozniona od wiadomosci gracza', () => {
  i18n.setLang('pl');
  const line = ui.chatLine({ from: 'WIDZ', role: 'spectator', text: 'z lewej!' });
  assert.ok(line.className.includes('spect'));
  assert.ok(texts(line).includes('widz'), 'plakietka "widz"');
  assert.ok(texts(line).includes('z lewej!'));
});

test('nick i tresc trafiaja na ekran jako TEKST, nie jako znaczniki', () => {
  const line = ui.chatLine({ from: '<img src=x onerror=alert(1)>', role: 'player', text: '<b>pogrubione</b>' });
  const all = texts(line);
  // tresc jest doklejana jako wezel tekstowy - zadne pole nie ustawia innerHTML
  assert.ok(all.some((x) => x.includes('<img src=x onerror=alert(1)>')), 'nick jako tekst');
  assert.ok(all.includes('<b>pogrubione</b>'), 'tresc jako tekst');
  assert.equal(flat(line).some((n) => 'innerHTML' in n && n.innerHTML), false);
});

test('wpisy systemowe sa po angielsku, gdy jezyk jest angielski', () => {
  i18n.setLang('en');
  assert.ok(texts(ui.chatLine({ system: 'chat.watching', vars: { nick: 'Z' } })).includes('Z is watching'));
  i18n.setLang('pl');
  assert.ok(texts(ui.chatLine({ system: 'chat.watching', vars: { nick: 'Z' } })).includes('Z ogląda'));
});

test('pokoj ma przycisk OPUSC POKOJ, ktory woła onLeave', () => {
  i18n.setLang('pl');
  let left = 0;
  ui.showLobby(lobbyMsg(), lobbyArgs({ onLeave: () => { left++; } }));
  const btn = flat(root).filter((n) => n.tagName === 'BUTTON').find((b) => b.children.includes('OPUŚĆ POKÓJ'));
  assert.ok(btn, 'przycisk jest');
  assert.ok(btn.className.includes('leave'), 'ma wlasna klase, zeby odrozniac go od Start');
  btn.listeners.click();
  assert.equal(left, 1);
});

test('bez onLeave przycisku nie ma (tryb LAN / zgodnosc wstecz)', () => {
  ui.showLobby(lobbyMsg(), lobbyArgs());
  assert.equal(texts(root).includes('OPUŚĆ POKÓJ'), false);
});

test('trwajaca gra na liscie pokoi da sie kliknac jako "Ogladaj"', () => {
  i18n.setLang('pl');
  let watched = null;
  let joined = null;
  const rooms = [{ code: 'GRAJ', players: 2, maxPlayers: 4, inGame: true, wave: 7, ageS: 30, spectators: 1 }];
  ui.showHome({ nick: 'A', rooms, sprites: null }, {
    onJoin: (c) => { joined = c; }, onNew() {}, onControls() {}, onChangeNick() {},
    onWatch: (c) => { watched = c; },
  });
  const row = flat(root).find((n) => n.className?.includes?.('room-row'));
  assert.ok(row, 'wiersz pokoju jest');
  assert.ok(texts(row).includes('Oglądaj'), 'plakietka "Ogladaj"');
  assert.ok(texts(row).some((x) => x.includes('1 ogląda')), 'widac, ilu oglada');
  row.listeners.click();
  assert.equal(watched, 'GRAJ');
  assert.equal(joined, null, 'to nie jest zwykle dolaczenie');
});

test('bez onWatch trwajaca gra zostaje nieklikalna (stary ekran glowny)', () => {
  const rooms = [{ code: 'GRAJ', players: 2, maxPlayers: 4, inGame: true, wave: 7, ageS: 30 }];
  ui.showHome({ nick: 'A', rooms, sprites: null }, { onJoin() {}, onNew() {}, onControls() {}, onChangeNick() {} });
  const row = flat(root).find((n) => n.className?.includes?.('room-row'));
  assert.equal(row.listeners.click, undefined, 'nic sie nie dzieje po kliknieciu');
  assert.ok(texts(row).includes('w toku'));
});
