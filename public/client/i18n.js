// Jezyk interfejsu (PL / EN). Przelacznik stoi na ekranie podawania nicku; wybor pamieta localStorage,
// wiec wraca po odswiezeniu. Polski jest jezykiem zrodlowym - teksty EN sa tlumaczeniem, nie odwrotnie.
//
// Zasady, zeby to sie nie rozjechalo:
//  * KAZDY klucz musi istniec w obu jezykach - pilnuje tego test `i18n.test.js`, nie dobra wola.
//  * `t()` ma awaryjny odwrot na polski i na sam klucz: brak tlumaczenia ma zrobic brzydki napis,
//    a nie `undefined` na ekranie albo wyjatek w srodku renderu panelu.
//  * Nazwy z `balance.json` (przedmioty, ultimate, wydarzenia, trudnosci) zostaja po polsku w pliku
//    balansu - angielskie siedza tutaj w `BALANCE_EN` i nakladaja sie dopiero przy wyswietlaniu.
//    Dzieki temu serwer i testy balansu maja JEDNO zrodlo nazw, a tlumaczenie jest czysto kliencka warstwa.

export const LANGS = ['pl', 'en'];
export const LANG_LABEL = { pl: 'POLSKI', en: 'ENGLISH' };
const KEY = 'pixelcoop.lang';
const DEFAULT = 'pl';

let lang = DEFAULT;
const listeners = new Set();

export function getLang() {
  return lang;
}

// Zmiana jezyka: zapis do localStorage (prywatne okno potrafi rzucic - to nie moze wywalic gry),
// atrybut `lang` na <html> dla czytnikow ekranu i dzielenia wyrazow, i powiadomienie sluchaczy.
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return lang;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* prywatne okno albo zablokowane cookies */ }
  try { document.documentElement.lang = next; } catch { /* brak DOM (testy) */ }
  for (const fn of [...listeners]) fn(next);
  return lang;
}

export function loadLang() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* j.w. */ }
  lang = LANGS.includes(saved) ? saved : DEFAULT;
  try { document.documentElement.lang = lang; } catch { /* brak DOM */ }
  return lang;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// `t('klucz')` albo `t('klucz', { ile: 3 })` - podstawienia pisane jako {ile}.
export function t(key, vars = null) {
  const s = STRINGS[lang]?.[key] ?? STRINGS[DEFAULT]?.[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Nazwa / opis encji z balance.json w biezacym jezyku. `fallback` to wartosc z balansu (polska).
export function bn(section, key, field, fallback) {
  if (lang === DEFAULT) return fallback;
  const v = BALANCE_EN[section]?.[key];
  const out = typeof v === 'string' ? v : v?.[field];
  return out ?? fallback;
}

// Opis progu ultimate (I / II / III) w biezacym jezyku.
export function ultTier(kind, i, fallback) {
  if (lang === DEFAULT) return fallback;
  return BALANCE_EN.ultimate?.[kind]?.tiers?.[i] ?? fallback;
}

const PL = {
  'lang.label': 'Język',
  'app.title': 'PIXEL CO-OP',

  // --- czat i tryb widza ---
  'chat.title': 'CZAT',
  'chat.placeholder': 'napisz wiadomość…',
  'chat.send': 'Wyślij',
  'chat.empty': 'Cisza. Napisz pierwszy.',
  'chat.openHint': 'Enter: czat',
  'chat.spectatorTag': 'widz',
  'chat.joined': '{nick} wszedł do pokoju',
  'chat.left': '{nick} wyszedł',
  'chat.watching': '{nick} ogląda',
  'chat.stoppedWatching': '{nick} przestał oglądać',
  'spectate.watch': 'Oglądaj',
  'spectate.banner': 'OGLĄDASZ — nie grasz, ale możesz pisać na czacie',
  'spectate.afterGame': 'Po tej partii wchodzisz do gry.',
  'room.watchers': '{n} ogląda',

  // --- nick / dolaczanie ---
  'nick.label': 'Twój nick',
  'nick.placeholder': 'nick',
  'nick.next': 'Dalej',
  'join.roomCode': 'Kod pokoju',
  'join.roomPlaceholder': 'puste = nowy pokój',
  'join.submitRooms': 'Dołącz / nowy pokój',
  'join.submit': 'Dołącz',

  // --- ekran glowny ---
  'home.changeNick': 'zmień nick',
  'home.statWave': 'najd. fala',
  'home.statKills': 'zabójstw',
  'home.statGames': 'partii',
  'home.play': 'GRAJ',
  'home.playHintLan': 'dołącza do gry na tym serwerze',
  'home.playHint': 'pierwszy pokój z miejscem albo nowy',
  'home.controls': 'Sterowanie',
  'home.settings': 'Ustawienia',
  'home.volume': 'Głośność',
  'home.mute': ' Wycisz',
  'home.fullscreen': 'Pełny ekran',
  'home.rooms': 'POKOJE',
  'home.newRoom': '+ Nowy pokój',
  'home.roomsUnavailable': 'lista pokojów niedostępna',
  'home.roomsEmpty': 'brak otwartych pokojów — załóż własny',
  'home.roomsCount': '{n} {word} · {free} z miejscem',
  'home.roomsOpenOne': 'otwarty',
  'home.roomsOpenMany': 'otwartych',
  'home.bestiary': 'Bestiariusz',
  'home.bestiaryHint': 'Najedź na potwora.',
  'home.noBoard': 'Leaderboard pojawi się po pierwszej partii.',
  'home.online': 'online: {players} · pokoje: {rooms}',
  'home.news': 'co nowego',

  // --- lista pokoi ---
  'room.players': '{n} / {max} graczy',
  'room.inGame': 'mecz w toku · fala {wave}',
  'room.full': 'pełny',
  'room.enter': 'Wejdź',
  'room.badgeInGame': 'w toku',
  'room.badgeFull': 'pełny',
  'room.lobbyTag': ' · lobby',
  'room.agoSec': '{n} s temu',
  'room.agoMin': '{n} min temu',

  // --- leaderboard ---
  'lb.title': 'Leaderboard',
  'lb.tabRuns': 'Przebiegi',
  'lb.tabPlayers': 'Gracze',
  'lb.wave': 'Fala',
  'lb.time': 'Czas',
  'lb.kills': 'Zab.',
  'lb.level': 'Poziom',
  'lb.players': 'Gracze',
  'lb.player': 'Gracz',
  'lb.games': 'Partie',
  'lb.bestWave': 'Najd. fala',
  'lb.yourPlace': 'Ty: miejsce {n}',

  // --- lobby ---
  'lobby.title': 'LOBBY',
  'lobby.players': 'Gracze',
  'lobby.invite': 'Zaproś',
  'lobby.joinLan': 'Dołącz z sieci LAN',
  'lobby.noLan': 'brak adresów LAN',
  'lobby.copyLink': 'kopiuj link',
  'lobby.copied': 'skopiowano',
  'lobby.difficulty': 'Trudność',
  'lobby.host': ' (host)',
  'lobby.choosing': 'wybiera ultimate…',
  'lobby.banner': 'WYBIERZ DWA ULTIMATE I KLIKNIJ START',
  'lobby.ultLabel': 'Twoje DWA ULTIMATE: pierwszy [F], drugi [C] · jeden wspólny pasek',
  'lobby.ultHint': 'Wybierz ultimate, najedź, żeby zobaczyć progi.',
  'lobby.start': 'Start',
  'lobby.startBlocked': 'Start (każdy wybiera dwa ultimate)',
  'lobby.waitHost': 'Czekam na hosta…',
  'lobby.leave': 'OPUŚĆ POKÓJ',

  // --- pauza / wyniki ---
  'pause.title': 'PAUZA',
  'pause.note': 'Gra trwa dalej.',
  'pause.resume': 'Wróć',
  'pause.leave': 'Wyjdź',
  'results.title': 'KONIEC GRY',
  'results.summary': 'Fala: {wave} · czas: {time}',
  'results.kills': 'Zabójstwa',
  'results.downs': 'Upadki',
  'results.toLobby': 'Do lobby',

  // --- sterowanie / poligon ---
  'controls.title': 'STEROWANIE',
  'controls.note': 'Poligon: wypróbuj na żywo. Bohater po lewej reaguje na klawisze, ściana obok jest do podniesienia, ślimak do zestrzelenia.',
  'controls.back': 'Wróć',
  'controls.orEsc': ' albo Esc',
  'ctrl.move': 'ruch (po śmierci A / D: kolejny obserwowany gracz)',
  'ctrl.use': 'podnieś przedmiot; trzymany: postaw lub użyj',
  'ctrl.drop': 'odłóż trzymany; puste ręce: przeładuj',
  'ctrl.rot': 'obróć trzymaną ścianę',
  'ctrl.rotKeys': 'Q / kółko',
  'ctrl.fire': 'strzał; z przedmiotem w rękach: rzut',
  'ctrl.fireKeys': 'Spacja / LPM',
  'ctrl.spec': 'po śmierci: następny obserwowany gracz',
  'ctrl.ult': 'ULTIMATE 1 / ULTIMATE 2 (wspólny pasek)',
  'ctrl.ready': 'gotowy (w przerwie między falami)',
  'ctrl.tab': 'tablica wyników (przytrzymaj)',
  'ctrl.esc': 'pauza',

  // --- HUD / efekty w grze ---
  'hud.downed': 'powalony',
  'hud.dead': 'martwy',
  'hud.tooLittle': 'ZA MAŁO',
  'hud.nobodyAlive': 'NIKT NIE ŻYJE',
  'hud.spectateHint': 'wracasz w przerwie · klik / A / D: zmień',
  'hud.weaponLv': 'BROŃ LV {lv}',
  'hud.frenzy': 'SZAŁ {s} s',
  'hud.pickup': '[E] podnieś: {what}',
  'fx.weaponBoost': 'BROŃ LV {lv} · {mod}',
  'fx.speed': 'SZYBKOŚĆ +{pct}%',
  'fx.hitBy': '{nick} trafił cię',
  'hud.reconnect': 'Utracono połączenie — łączę ponownie…',
  'ctrl.mouseLegend': 'LPM = Spacja · kółko = Q',
  'ctrl.mouseSpec': 'PPM: obserwowanie',
  'net.connecting': 'Łączę…',
  'net.lost': 'Utracono połączenie',
  'net.rejected': 'Odrzucono',
};

const EN = {
  'lang.label': 'Language',
  'app.title': 'PIXEL CO-OP',

  // --- czat i tryb widza ---
  'chat.title': 'CHAT',
  'chat.placeholder': 'type a message…',
  'chat.send': 'Send',
  'chat.empty': 'Quiet in here. Be the first.',
  'chat.openHint': 'Enter: chat',
  'chat.spectatorTag': 'spectator',
  'chat.joined': '{nick} joined the room',
  'chat.left': '{nick} left',
  'chat.watching': '{nick} is watching',
  'chat.stoppedWatching': '{nick} stopped watching',
  'spectate.watch': 'Watch',
  'spectate.banner': 'WATCHING — you are not playing, but you can still chat',
  'spectate.afterGame': 'You join the game after this match.',
  'room.watchers': '{n} watching',

  'nick.label': 'Your nickname',
  'nick.placeholder': 'nickname',
  'nick.next': 'Next',
  'join.roomCode': 'Room code',
  'join.roomPlaceholder': 'empty = new room',
  'join.submitRooms': 'Join / new room',
  'join.submit': 'Join',

  'home.changeNick': 'change nickname',
  'home.statWave': 'best wave',
  'home.statKills': 'kills',
  'home.statGames': 'games',
  'home.play': 'PLAY',
  'home.playHintLan': 'joins the game on this server',
  'home.playHint': 'first room with a free slot, or a new one',
  'home.controls': 'Controls',
  'home.settings': 'Settings',
  'home.volume': 'Volume',
  'home.mute': ' Mute',
  'home.fullscreen': 'Fullscreen',
  'home.rooms': 'ROOMS',
  'home.newRoom': '+ New room',
  'home.roomsUnavailable': 'room list unavailable',
  'home.roomsEmpty': 'no open rooms — start your own',
  'home.roomsCount': '{n} {word} · {free} with space',
  'home.roomsOpenOne': 'open',
  'home.roomsOpenMany': 'open',
  'home.bestiary': 'Bestiary',
  'home.bestiaryHint': 'Hover over a monster.',
  'home.noBoard': 'The leaderboard shows up after the first game.',
  'home.online': 'online: {players} · rooms: {rooms}',
  'home.news': "what's new",

  'room.players': '{n} / {max} players',
  'room.inGame': 'match in progress · wave {wave}',
  'room.full': 'full',
  'room.enter': 'Enter',
  'room.badgeInGame': 'in progress',
  'room.badgeFull': 'full',
  'room.lobbyTag': ' · lobby',
  'room.agoSec': '{n} s ago',
  'room.agoMin': '{n} min ago',

  'lb.title': 'Leaderboard',
  'lb.tabRuns': 'Runs',
  'lb.tabPlayers': 'Players',
  'lb.wave': 'Wave',
  'lb.time': 'Time',
  'lb.kills': 'Kills',
  'lb.level': 'Level',
  'lb.players': 'Players',
  'lb.player': 'Player',
  'lb.games': 'Games',
  'lb.bestWave': 'Best wave',
  'lb.yourPlace': 'You: place {n}',

  'lobby.title': 'LOBBY',
  'lobby.players': 'Players',
  'lobby.invite': 'Invite',
  'lobby.joinLan': 'Join from the LAN',
  'lobby.noLan': 'no LAN addresses',
  'lobby.copyLink': 'copy link',
  'lobby.copied': 'copied',
  'lobby.difficulty': 'Difficulty',
  'lobby.host': ' (host)',
  'lobby.choosing': 'choosing an ultimate…',
  'lobby.banner': 'PICK TWO ULTIMATES AND HIT START',
  'lobby.ultLabel': 'Your TWO ULTIMATES: first [F], second [C] · one shared bar',
  'lobby.ultHint': 'Pick an ultimate, hover to see its tiers.',
  'lobby.start': 'Start',
  'lobby.startBlocked': 'Start (everyone picks two ultimates)',
  'lobby.waitHost': 'Waiting for the host…',
  'lobby.leave': 'LEAVE ROOM',

  'pause.title': 'PAUSED',
  'pause.note': 'The game keeps running.',
  'pause.resume': 'Back',
  'pause.leave': 'Leave',
  'results.title': 'GAME OVER',
  'results.summary': 'Wave: {wave} · time: {time}',
  'results.kills': 'Kills',
  'results.downs': 'Downs',
  'results.toLobby': 'To lobby',

  'controls.title': 'CONTROLS',
  'controls.note': 'Training range: try it live. The hero on the left reacts to your keys, the wall next to him can be picked up, the slime can be shot.',
  'controls.back': 'Back',
  'controls.orEsc': ' or Esc',
  'ctrl.move': 'move (when dead, A / D: next spectated player)',
  'ctrl.use': 'pick up an item; holding one: place or use it',
  'ctrl.drop': 'drop what you hold; empty hands: reload',
  'ctrl.rot': 'rotate the wall you hold',
  'ctrl.rotKeys': 'Q / wheel',
  'ctrl.fire': 'shoot; with an item in hand: throw',
  'ctrl.fireKeys': 'Space / LMB',
  'ctrl.spec': 'when dead: next spectated player',
  'ctrl.ult': 'ULTIMATE 1 / ULTIMATE 2 (shared bar)',
  'ctrl.ready': 'ready (during the break between waves)',
  'ctrl.tab': 'scoreboard (hold)',
  'ctrl.esc': 'pause',

  'hud.downed': 'downed',
  'hud.dead': 'dead',
  'hud.tooLittle': 'NOT ENOUGH',
  'hud.nobodyAlive': 'NOBODY IS ALIVE',
  'hud.spectateHint': "you're back next break · click / A / D: switch",
  'hud.weaponLv': 'WEAPON LV {lv}',
  'hud.frenzy': 'FRENZY {s} s',
  'hud.pickup': '[E] pick up: {what}',
  'fx.weaponBoost': 'WEAPON LV {lv} · {mod}',
  'fx.speed': 'SPEED +{pct}%',
  'fx.hitBy': '{nick} hit you',
  'hud.reconnect': 'Connection lost — reconnecting…',
  'ctrl.mouseLegend': 'LMB = Space · wheel = Q',
  'ctrl.mouseSpec': 'RMB: spectating',
  'net.connecting': 'Connecting…',
  'net.lost': 'Connection lost',
  'net.rejected': 'Rejected',
};

const STRINGS = { pl: PL, en: EN };
export const KEYS = Object.keys(PL);

// Angielskie nazwy encji z balance.json. Klucze = klucze z balansu; test pilnuje, ze zadnej nie brakuje.
export const BALANCE_EN = {
  weaponMods: { fan: 'SPREAD', homing: 'HOMING', nailgun: 'NAILGUN' },
  items: {
    wall: 'Piece of wall', boulder: 'Boulder', spikes: 'Spikes',
    turret30: 'Turret 30 s', turret60: 'Turret 60 s', turret90: 'Turret 90 s',
    platform30: 'Healing pad 30 s', platform60: 'Healing pad 60 s', platform90: 'Healing pad 90 s',
    mine: 'Mine', weaponboost: 'Weapon boost', hpboost: 'Heart', speedboost: 'Boots',
    armorer: 'Armorer', cage: 'Cage trap',
  },
  events: { builders: 'ARMY OF BUILDERS', quake: 'EARTHQUAKE', flyby: 'NINJA FLYBY' },
  difficulty: {
    1: { name: 'Easy', desc: 'Long breaks, lots of drops, weaker monsters' },
    2: { name: 'Normal', desc: 'The game the way we designed it' },
    3: { name: 'Hard', desc: 'Stronger monsters, less time to build' },
    4: { name: 'Nightmare', desc: 'Short breaks, few drops, monsters with x2 HP' },
  },
  ultimate: {
    shockwave: {
      name: 'Shockwave', blurb: 'Pushes back and hurts monsters around you.',
      tiers: ['radius 4, 40 dmg, knockback 2', 'radius 6, 80 dmg, knockback 3, stun 1 s', 'radius 8, 150 dmg, knockback 4, stun 2 s'],
    },
    wall: {
      name: 'Emergency wall', blurb: 'Puts up emergency walls in front of you.',
      tiers: ['3 walls in front of you, 80 HP, 30 s', '5 walls, 150 HP, 45 s', 'a ring of 8 walls around you, 150 HP, 60 s'],
    },
    heal: {
      name: 'Heal', blurb: 'Heals and revives allies.',
      tiers: ['+40 HP within radius 6', '+80 HP, revives downed allies in range', 'full HP for everyone, revives, 3 s invulnerability'],
    },
    frenzy: {
      name: 'Frenzy', blurb: 'Briefly far heavier fire.',
      tiers: ['8 s: damage x2, faster fire', '12 s: like I + piercing bullets', '15 s: like II + triple shot + speed x1.3'],
    },
    widegun: {
      name: 'Wide gun', blurb: 'A cone salvo towards the cursor.',
      tiers: ['30° cone, range 8, 60 dmg', '45° cone, range 10, 100 dmg', '60° cone, range 12, 180 dmg, through obstacles'],
    },
    rocket: {
      name: 'Rocket', blurb: 'A rocket that explodes and sets things on fire.',
      tiers: ['blast radius 2.5, 140 dmg, stun', 'radius 3.5, 260 dmg, burning 4 s', '3 rockets in a fan, burning 6 s'],
    },
    freeze: {
      name: 'Freeze', blurb: 'Freezes monsters nearby.',
      tiers: ['monsters within radius 6 stand still for 3 s', 'radius 10, 5 s, +50% damage', 'the whole map, 6 s, +50% damage, then a slow'],
    },
  },
};
