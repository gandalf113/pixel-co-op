// Przelacznik jezyka (PL / EN) na ekranie podawania nicku.
// Testy pilnuja rzeczy, ktorych oko nie wylapie: brakujacego klucza, zgubionego podstawienia {x},
// nieprzetlumaczonej nazwy z balance.json i polskiego tekstu, ktory zostal w angielskim slowniku.
import test from 'node:test';
import assert from 'node:assert/strict';
import { balance } from './helpers.js';

// --- atrapa DOM i localStorage (jak w ui.test.js) ---
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
  return node;
}
const root = makeNode('div');
globalThis.document = { getElementById: () => root, createElement: makeNode, documentElement: {} };
const store = new Map();
globalThis.location = { href: 'https://obrzyn.online/?r=AAAA', protocol: 'https:', host: 'obrzyn.online' };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => {} } }, configurable: true });
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

const i18n = await import('../public/client/i18n.js');
const ui = await import('../public/client/ui.js');
const content = await import('../public/client/content.js');
const { controlRows } = await import('../public/client/controls.js');

const PL_CHARS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
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

test('kazdy klucz istnieje w obu jezykach i ma te same podstawienia', () => {
  const pl = new Map(), en = new Map();
  for (const k of i18n.KEYS) {
    i18n.setLang('pl'); pl.set(k, i18n.t(k));
    i18n.setLang('en'); en.set(k, i18n.t(k));
  }
  i18n.setLang('pl');
  for (const k of i18n.KEYS) {
    assert.notEqual(en.get(k), k, `brak tlumaczenia EN dla klucza ${k}`);
    const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(vars(en.get(k)), vars(pl.get(k)), `rozne podstawienia w kluczu ${k}`);
  }
});

test('w angielskim slowniku nie zostal polski tekst', () => {
  i18n.setLang('en');
  for (const k of i18n.KEYS) {
    assert.equal(PL_CHARS.test(i18n.t(k)), false, `polskie znaki w angielskim kluczu ${k}: ${i18n.t(k)}`);
  }
  for (const [, name, text] of content.bestiary()) {
    assert.equal(PL_CHARS.test(`${name} ${text}`), false, `polski bestiariusz w EN: ${name}`);
  }
  for (const tip of content.tips()) assert.equal(PL_CHARS.test(tip), false, `polska porada w EN: ${tip}`);
  for (const [, txt] of content.news()) assert.equal(PL_CHARS.test(txt), false, `polskie "co nowego" w EN: ${txt}`);
  for (const [, , keys, txt] of controlRows()) assert.equal(PL_CHARS.test(`${keys} ${txt}`), false, `polskie sterowanie w EN: ${txt}`);
  i18n.setLang('pl');
});

test('kazda nazwa z balance.json ma angielski odpowiednik', () => {
  const E = i18n.BALANCE_EN;
  for (const kind of Object.keys(balance.items)) assert.ok(E.items[kind], `brak EN dla przedmiotu ${kind}`);
  // weaponMods trzyma obok modyfikatorow takze zwykle liczby (maxLevel) - biora sie tylko wpisy z nazwa
  const mods = Object.entries(balance.weaponMods).filter(([, v]) => v && typeof v === 'object' && v.name);
  assert.ok(mods.length >= 3, 'sa modyfikatory do sprawdzenia');
  for (const [kind] of mods) assert.ok(E.weaponMods[kind], `brak EN dla modyfikatora ${kind}`);
  for (const kind of Object.keys(balance.events.kinds)) assert.ok(E.events[kind], `brak EN dla wydarzenia ${kind}`);
  for (const [kind, u] of Object.entries(balance.ultimate.kinds)) {
    const e = E.ultimate[kind];
    assert.ok(e?.name && e?.blurb, `brak EN dla ultimate ${kind}`);
    assert.equal(e.tiers.length, u.tiers.length, `inna liczba progow EN dla ${kind}`);
  }
  balance.difficulty.forEach((d, i) => {
    assert.ok(E.difficulty[i + 1]?.name && E.difficulty[i + 1]?.desc, `brak EN dla trudnosci ${i + 1}`);
  });
});

test('bestiariusz, porady i "co nowego" maja tyle samo pozycji w obu jezykach', () => {
  i18n.setLang('pl');
  const pl = [content.bestiary().length, content.tips().length, content.news().length];
  i18n.setLang('en');
  const en = [content.bestiary().length, content.tips().length, content.news().length];
  assert.deepEqual(en, pl);
  // bestiariusz musi trzymac te same klucze potworow i w tej samej kolejnosci
  i18n.setLang('pl');
  const keysPl = content.bestiary().map(([k]) => k);
  i18n.setLang('en');
  assert.deepEqual(content.bestiary().map(([k]) => k), keysPl);
  i18n.setLang('pl');
});

test('ekran nicku ma przelacznik, a klikniecie EN zmienia napisy', () => {
  i18n.setLang('pl');
  ui.showNickScreen({ nick: 'ALA' }, () => {});
  assert.ok(texts(root).includes('Twój nick'), 'po polsku domyslnie');
  const buttons = flat(root).filter((n) => n.tagName === 'BUTTON');
  const en = buttons.find((b) => b.children.includes('ENGLISH'));
  const pl = buttons.find((b) => b.children.includes('POLSKI'));
  assert.ok(en && pl, 'sa oba przyciski jezyka');
  assert.ok(pl.className.includes('sel') && !en.className.includes('sel'), 'polski podswietlony');
  en.listeners.click();
  assert.equal(i18n.getLang(), 'en');
  // ekran przerysowuje main.js przez onLangChange; tu rysujemy recznie i sprawdzamy tresc
  ui.showNickScreen({ nick: 'ALA' }, () => {});
  const after = texts(root);
  assert.ok(after.includes('Your nickname'), `etykieta po angielsku, bylo: ${after.join(' | ')}`);
  assert.ok(after.includes('Next'), 'przycisk po angielsku');
  i18n.setLang('pl');
});

test('wybor jezyka wraca po odswiezeniu (localStorage), a smiec w zapisie nie psuje gry', () => {
  i18n.setLang('en');
  assert.equal(i18n.loadLang(), 'en', 'zapisany jezyk wraca');
  store.set('pixelcoop.lang', 'klingon');
  assert.equal(i18n.loadLang(), 'pl', 'nieznany jezyk -> polski, bez wyjatku');
  store.delete('pixelcoop.lang');
  assert.equal(i18n.loadLang(), 'pl');
});

test('brak klucza daje sam klucz, nie "undefined" na ekranie', () => {
  i18n.setLang('en');
  assert.equal(i18n.t('nie.ma.takiego.klucza'), 'nie.ma.takiego.klucza');
  i18n.setLang('pl');
});

test('lobby ma wyrazny baner "wybierz dwa ultimate i kliknij start" w obu jezykach', () => {
  const msg = {
    difficulty: 2, youAreHost: true, room: 'ABCD',
    players: [{ id: 1, nick: 'A', color: '#fff', host: true, ultKind: null, ultKind2: null }],
  };
  const args = {
    difficulties: balance.difficulty, ultimates: balance.ultimate.kinds, icons: {}, myId: 1,
    onUlt() {}, onDifficulty() {}, onStart() {},
  };
  for (const [lang, want] of [['pl', 'WYBIERZ DWA ULTIMATE I KLIKNIJ START'], ['en', 'PICK TWO ULTIMATES AND HIT START']]) {
    i18n.setLang(lang);
    ui.showLobby(msg, args);
    assert.ok(texts(root).includes(want), `baner po ${lang}`);
    const banner = flat(root).find((n) => n.className === 'lobby-banner');
    assert.ok(banner, 'baner ma wlasna klase, zeby dalo sie go wyroznic stylem');
  }
  i18n.setLang('pl');
});
