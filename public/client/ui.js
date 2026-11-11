import { drawControls, CONTROLS_SIZE } from './controls.js';
import { drawLogo, logoSize } from './logo.js';
import { COLORS, CHAT } from '../shared/protocol.js';
import { bestiary, tips, news } from './content.js';
import { t, bn, ultTier, LANGS, LANG_LABEL, getLang, setLang } from './i18n.js';

const root = () => document.getElementById('ui');

// Dzwieki interfejsu (V3-K-06): main.js podpina syntezator; bez niego przyciski sa nieme (testy).
let uiSfx = null;
export function setUiSfx(fn) {
  uiSfx = fn;
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  if (tag === 'button') {
    e.addEventListener('mouseenter', () => uiSfx?.('uiHover'));
    e.addEventListener('click', () => uiSfx?.('uiClick'));
  }
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

// `side` = panel dokowany do prawej krawedzi (poligon sterowania), zeby scena z gry byla widoczna po lewej.
function show(panel, { side = false } = {}) {
  const r = root();
  r.classList?.toggle('side', side);
  r.replaceChildren(panel);
  return panel;
}

// Obrazek sprite'a jako <img> (data URL); atrapa canvasu w testach nie ma toDataURL, wtedy null.
function spriteImg(sprites, name, className, scale = 3) {
  const c = sprites?.get(name);
  const url = c?.toDataURL?.();
  if (!url) return null;
  return el('img', { className, src: url, alt: '', width: c.width * scale, height: c.height * scale });
}

export function formatTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function hideAll() {
  root().classList?.toggle('side', false);
  root().replaceChildren();
}

export function showMessage(text) {
  show(el('div', { className: 'panel msg' }, text));
}

// Nazwy trudnosci w leaderboardzie: angielskie z i18n, polskie zrodlowe tutaj.
const DIFF_NAMES = ['łatwy', 'normalny', 'trudny', 'koszmar'];
const diffName = (lv) => bn('difficulty', lv, 'name', DIFF_NAMES[lv - 1] ?? '?');

// Leaderboard przychodzi z serwera statystyk (wyniki liczy symulacja serwerowa,
// klient nie ma jak ich podrobić). Brak danych = panel się nie pokazuje.
export function leaderboardPanel(data, { limit = Infinity, nick = null } = {}) {
  if (!data || (!data.runs?.length && !data.players?.length)) return null;
  const body = el('div', {});
  const tabs = el('div', { className: 'lb-tabs' });
  const render = (which) => {
    for (const b of tabs.children) b.classList.toggle('sel', b.dataset.k === which);
    if (which === 'runs') {
      body.replaceChildren(el('table', { className: 'lb' },
        el('tr', {}, el('th', {}, '#'), el('th', {}, t('lb.wave')), el('th', {}, t('lb.time')), el('th', {}, t('lb.kills')), el('th', {}, t('lb.level')), el('th', {}, t('lb.players'))),
        ...data.runs.slice(0, limit).map((r, i) => el('tr', { className: nick && (r.players ?? []).includes(nick) ? 'me' : '' },
          el('td', {}, String(i + 1)),
          el('td', {}, String(r.wave)),
          el('td', {}, formatTime(r.timeS)),
          el('td', {}, String(r.kills)),
          el('td', { className: 'muted' }, diffName(r.difficulty)),
          el('td', {}, (r.players ?? []).join(', '))))));
    } else {
      body.replaceChildren(el('table', { className: 'lb' },
        el('tr', {}, el('th', {}, '#'), el('th', {}, t('lb.player')), el('th', {}, t('lb.kills')), el('th', {}, t('lb.games')), el('th', {}, t('lb.bestWave'))),
        ...(data.players ?? []).slice(0, limit).map((r, i) => el('tr', { className: r.nick === nick ? 'me' : '' },
          el('td', {}, String(i + 1)),
          el('td', {}, r.nick),
          el('td', {}, String(r.kills)),
          el('td', {}, String(r.games)),
          el('td', {}, String(r.bestWave))))));
      // Twoje miejsce, gdy nie miescisz sie w limicie.
      const idx = nick ? (data.players ?? []).findIndex((r) => r.nick === nick) : -1;
      if (idx >= limit) body.append(el('div', { className: 'muted lb-me' }, t('lb.yourPlace', { n: idx + 1 })));
    }
  };
  for (const [k, label] of [['runs', t('lb.tabRuns')], ['players', t('lb.tabPlayers')]]) {
    const btn = el('button', { type: 'button', className: 'lb-tab', onclick: () => render(k) }, label);
    btn.dataset.k = k;
    tabs.append(btn);
  }
  render('runs');
  return el('div', { className: 'lb-wrap' }, el('label', {}, t('lb.title')), tabs, body);
}

export function roomLink(code) {
  const url = new URL(location.href);
  url.hash = '';
  url.search = `?r=${code}`;
  return url.toString();
}

// Tryb LAN: samo pole nicku (jedna sesja na serwer).
// Tryb hostowany: nick + kod pokoju; puste pole = nowy pokój.
export function showJoinForm({ nick = '', room = '', rooms = false, leaderboard = null }, onSubmit) {
  const nickInput = el('input', { type: 'text', maxLength: 12, value: nick, placeholder: t('nick.placeholder'), autofocus: true });
  const codeInput = el('input', { type: 'text', maxLength: 8, value: room, placeholder: t('join.roomPlaceholder'), className: 'code' });
  const error = el('div', { className: 'muted' });
  const submit = (code) => {
    const n = nickInput.value.trim();
    if (!n) return;
    onSubmit(n, code);
  };
  const form = el('form', {
    onsubmit: (e) => {
      e.preventDefault();
      submit(rooms ? codeInput.value.trim().toUpperCase() || null : null);
    },
  },
  el('h1', {}, t('app.title')),
  el('label', {}, t('nick.label')), nickInput,
  rooms ? el('label', {}, t('join.roomCode')) : null,
  rooms ? codeInput : null,
  el('button', { type: 'submit' }, rooms ? t('join.submitRooms') : t('join.submit')),
  error);
  const board = leaderboardPanel(leaderboard);
  show(el('div', { className: `panel${board ? ' wide' : ''}` }, form, board));
  nickInput.focus();
  return { error: (text) => { error.textContent = text ?? ''; } };
}

// Przelacznik jezyka (PL / EN). Stoi na ekranie podawania nicku - to pierwszy ekran gry, wiec wybor
// zapada przed cala reszta interfejsu. Zmiana jezyka przerysowuje biezacy ekran przez `onLangChange`
// w main.js; tutaj tylko ustawiamy jezyk.
export function langSwitch() {
  const row = el('div', { className: 'lang-row' }, el('span', { className: 'muted lang-label' }, t('lang.label')));
  for (const code of LANGS) {
    const b = el('button', {
      type: 'button',
      className: `lang-btn${getLang() === code ? ' sel' : ''}`,
      onclick: () => setLang(code),
    }, LANG_LABEL[code]);
    row.append(b);
  }
  return row;
}

// K-02, krok 1: sam nick.
export function showNickScreen({ nick = '' } = {}, onSubmit) {
  const input = el('input', { type: 'text', maxLength: 12, value: nick, placeholder: t('nick.placeholder'), autofocus: true });
  const error = el('div', { className: 'muted' });
  show(el('div', { className: 'panel' },
    el('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const n = input.value.trim();
        if (n) onSubmit(n);
      },
    },
    el('h1', {}, t('app.title')),
    langSwitch(),
    el('label', {}, t('nick.label')), input,
    el('button', { type: 'submit' }, t('nick.next')),
    error)));
  input.focus();
  return { error: (text) => { error.textContent = text ?? ''; } };
}

// Jeden wiersz listy pokoi. Wiersz jest klikalny tylko wtedy, gdy da się wejść.
export function roomRowInfo(r) {
  const full = r.players >= r.maxPlayers;
  const lines = [t('room.players', { n: r.players, max: r.maxPlayers })];
  if (r.inGame) lines.push(t('room.inGame', { wave: r.wave }));
  else if (full) lines.push(t('room.full'));
  if (r.spectators > 0) lines.push(t('room.watchers', { n: r.spectators }));
  return { joinable: !r.inGame && !full, text: lines.join(' · ') };
}

// Logotyp na <canvas>; w testach (atrapa bez getContext) zostaje pusty element z tekstem alternatywnym.
function logoCanvas() {
  const { w, h } = logoSize();
  const canvas = el('canvas', { width: w, height: h, className: 'logo' });
  const ctx = canvas.getContext?.('2d');
  if (ctx) drawLogo(ctx);
  else canvas.textContent = 'PIXEL CO-OP';
  return canvas;
}

export function formatAge(s) {
  if (!Number.isFinite(s)) return '';
  if (s < 60) return t('room.agoSec', { n: Math.max(0, Math.round(s)) });
  return t('room.agoMin', { n: Math.floor(s / 60) });
}

// Karta pokoju: kod, cztery sloty (zajety = sprite gracza w kolorze slotu), opis. Klikalna tylko, gdy da sie wejsc.
function roomCard(r, sprites, onJoin, onWatch) {
  const info = roomRowInfo(r);
  // Trwajaca gra nie jest juz slepym zaulkiem: da sie wejsc jako widz i pisac na czacie.
  const watchable = !!onWatch && r.inGame;
  const slots = el('div', { className: 'slots' }, ...Array.from({ length: r.maxPlayers }, (_, i) => {
    const taken = i < r.players;
    const img = taken ? spriteImg(sprites, `player_0@${COLORS[i % COLORS.length]}`, 'slot-img', 2) : null;
    return el('div', { className: `slot${taken ? ' taken' : ''}`, style: taken ? { borderColor: COLORS[i % COLORS.length] } : {} }, img);
  }));
  // B2 (V3-K-08): karta dwuwierszowa - kod, sloty, Wejdz / plakietka; pod spodem opis i wiek pokoju.
  const tag = info.joinable ? el('span', { className: 'enter' }, t('room.enter'))
    : watchable ? el('span', { className: 'enter watch' }, t('spectate.watch'))
      : el('span', { className: 'badge' }, r.inGame ? t('room.badgeInGame') : t('room.badgeFull'));
  const row = el('li', { className: `room-row${info.joinable ? '' : ' closed'}` },
    el('div', { className: 'room-top' }, el('span', { className: 'room-code-s' }, r.code), slots, el('span', { className: 'spacer' }), tag),
    el('span', { className: 'room-info' }, `${info.text}${r.inGame ? '' : t('room.lobbyTag')} · ${formatAge(r.ageS)}`));
  if (info.joinable) {
    row.classList.toggle('join', true);
    row.addEventListener('click', () => onJoin(r.code));
  } else if (watchable) {
    row.classList.toggle('join', true);
    row.classList.toggle('watch', true);
    row.addEventListener('click', () => onWatch(r.code));
  }
  return row;
}

// K-02, krok 2 / V3-K-06: ekran główny. `rooms` = tablica | null (nie wiadomo / tryb LAN); lan = bez listy.
// Opcje poza wymaganymi: color (kolor bohatera), sprites (Map z bakeSprites), version, online {players, rooms},
// audio {volume, muted}. Callbacki poza wymaganymi sa opcjonalne.
export function showHome({ nick = '', lan = false, rooms = null, leaderboard = null, message = '', color = COLORS[0], sprites = null, version = null, online = null, audio = null },
  { onJoin, onNew, onPlay, onControls, onChangeNick, onVolume, onMute, onFullscreen, onWatch = null }) {
  const list = el('ul', { className: 'rooms' });
  const note = el('div', { className: 'muted note' }, message);
  const count = el('span', { className: 'muted count' });
  let joinable = [];
  const setRooms = (data) => {
    joinable = Array.isArray(data) ? data.filter((r) => roomRowInfo(r).joinable) : [];
    count.textContent = Array.isArray(data)
      ? t('home.roomsCount', { n: data.length, word: t(data.length === 1 ? 'home.roomsOpenOne' : 'home.roomsOpenMany'), free: joinable.length })
      : '';
    if (!Array.isArray(data)) {
      list.replaceChildren(el('li', { className: 'muted' }, t('home.roomsUnavailable')));
      return;
    }
    if (!data.length) {
      list.replaceChildren(el('li', { className: 'muted' }, t('home.roomsEmpty')));
      return;
    }
    list.replaceChildren(...data.map((r) => roomCard(r, sprites, onJoin, onWatch)));
  };
  if (!lan) setRooms(rooms);

  // GRAJ: pierwszy pokoj z miejscem, a gdy go nie ma - nowy. W LAN po prostu dolacza.
  const play = () => {
    if (onPlay) onPlay(joinable[0]?.code ?? null);
    else if (!lan && joinable[0]) onJoin(joinable[0].code);
    else onNew();
  };

  // Wizytowka: sprite w kolorze, nick, wyniki z leaderboardu.
  const mine = (leaderboard?.players ?? []).find((p) => p.nick === nick) ?? null;
  const stat = (label, v) => el('div', { className: 'stat' }, el('b', {}, v == null ? '–' : String(v)), el('span', { className: 'muted' }, label));
  // Ustawienia (glosnosc, wyciszenie, pelny ekran) chowaja sie pod przyciskiem, zeby nie rozpychac wizytowki.
  const settings = el('div', { className: 'settings', hidden: true },
    el('label', { className: 'muted' }, t('home.volume'),
      el('input', {
        type: 'range', min: '0', max: '100', step: '1', value: String(Math.round((audio?.volume ?? 0.7) * 100)),
        oninput: (ev) => onVolume?.(Number(ev.target.value) / 100),
      })),
    el('label', { className: 'muted' },
      el('input', { type: 'checkbox', checked: !!audio?.muted, onchange: (ev) => onMute?.(!!ev.target.checked) }),
      t('home.mute')),
    el('button', { className: 'small', onclick: () => onFullscreen?.() }, t('home.fullscreen')));
  const me = el('section', { className: 'card me' },
    el('div', { className: 'hero' }, spriteImg(sprites, `player_0@${color}`, 'hero-img', 4)),
    el('div', { className: 'nick', style: { color } }, nick),
    el('a', { className: 'link', onclick: onChangeNick }, t('home.changeNick')),
    el('div', { className: 'stats' }, stat(t('home.statWave'), mine?.bestWave), stat(t('home.statKills'), mine?.kills), stat(t('home.statGames'), mine?.games)));

  const playBlock = el('div', { className: 'play' },
    el('button', { className: 'big', onclick: play }, t('home.play')),
    el('div', { className: 'muted small center' }, lan ? t('home.playHintLan') : t('home.playHint')),
    el('div', { className: 'row' },
      el('button', { onclick: onControls }, t('home.controls')),
      el('button', { onclick: () => { settings.hidden = !settings.hidden; } }, t('home.settings'))),
    settings,
    note);

  const board = leaderboardPanel(leaderboard, { limit: 6, nick });
  const boardCol = el('section', { className: 'card board' }, board ?? el('div', { className: 'muted' }, t('home.noBoard')));

  // B2 (V3-K-08): POKOJE jako osobna sekcja w zlotej ramce: naglowek z licznikiem i "Nowy pokoj", siatka kart.
  const roomsSection = lan ? null : el('section', { className: 'card rooms-section' },
    el('div', { className: 'section-head' },
      el('span', { className: 'title' }, t('home.rooms')), el('span', { className: 'rule' }), count,
      el('button', { className: 'small', onclick: onNew }, t('home.newRoom'))),
    list);

  // Bestiariusz: sprite'y potworow, po najechaniu jedno zdanie.
  const blurb = el('div', { className: 'muted blurb' }, t('home.bestiaryHint'));
  const beast = el('div', { className: 'bestiary' }, ...bestiary().map(([type, name, text]) => {
    const tile = el('div', { className: 'beast' }, spriteImg(sprites, `${type}_0`, 'beast-img', 2), el('div', { className: 'beast-name' }, name));
    tile.addEventListener('mouseenter', () => { blurb.textContent = `${name}: ${text}`; });
    return tile;
  }));

  // Stopka: porada (rotowana przez main.js przez tick()), puls serwera, wersja, co nowego.
  const TIP_LIST = tips();
  let tipIdx = Math.floor(Math.random() * TIP_LIST.length);
  const tip = el('div', { className: 'tip' }, TIP_LIST[tipIdx]);
  const pulse = el('span', { className: 'muted' });
  const setOnline = (o) => {
    pulse.textContent = o && Number.isFinite(o.players) ? t('home.online', { players: o.players, rooms: o.rooms ?? 0 }) : '';
  };
  setOnline(online);
  const newsBox = el('div', { className: 'news', hidden: true }, ...news().map(([v, text]) => el('div', {}, el('b', {}, `v${v}`), ` ${text}`)));
  const newsLink = el('a', { className: 'link', onclick: () => { newsBox.hidden = !newsBox.hidden; } }, t('home.news'));
  const foot = el('div', { className: 'home-foot' }, tip, el('div', { className: 'muted' }, pulse, version ? ` · v${version} · ` : ' · ', newsLink), newsBox);

  const beastCard = el('section', { className: 'card beast-card' }, el('label', {}, t('home.bestiary')), beast, blurb);
  show(el('div', { className: 'panel home' },
    el('div', { className: 'home-left' }, logoCanvas(), me, playBlock, boardCol, foot),
    el('div', { className: 'home-right' }, roomsSection, beastCard)));
  return {
    setRooms,
    setOnline,
    message: (text) => { note.textContent = text ?? ''; },
    tick: () => { tipIdx = (tipIdx + 1) % TIP_LIST.length; tip.textContent = TIP_LIST[tipIdx]; },
  };
}

// K-04 / V3-K-07: poligon. Panel dokowany po prawej, scena z gry po lewej (rysuje ja main.js na #world).
// Zwraca setPressed(zbior etykiet), ktore podswietla trzymane klawisze na obrazku.
export function showControls(onBack) {
  const canvas = el('canvas', { width: CONTROLS_SIZE.w, height: CONTROLS_SIZE.h, className: 'controls-img' });
  const ctx = canvas.getContext?.('2d');
  let last = '';
  const setPressed = (pressed) => {
    const key = [...pressed].sort().join('|');
    if (key === last || !ctx) return;
    last = key;
    drawControls(ctx, pressed);
  };
  if (ctx) drawControls(ctx);
  show(el('div', { className: 'panel range' },
    el('h2', {}, t('controls.title')),
    el('p', { className: 'muted' }, t('controls.note')),
    canvas,
    el('div', {}, el('button', { onclick: onBack }, t('controls.back')), el('span', { className: 'muted' }, t('controls.orEsc')))), { side: true });
  return { setPressed };
}

export function showNickForm(onSubmit, initial = '') {
  return showJoinForm({ nick: initial }, (nick) => onSubmit(nick));
}


// --- Czat --------------------------------------------------------------------------------------
// Jeden panel obsluguje pokoj. Wiadomosci wstawiamy WYLACZNIE jako tekst (el() dokleja stringi jako
// wezly tekstowe) - nigdy innerHTML, wiec nick ani tresc nie moga wstrzyknac znacznikow.
// Wpisy systemowe przychodza z serwera jako KLUCZ i18n (`system` + `vars`), nie gotowe zdanie,
// wiec kazdy widzi je w swoim jezyku.
export function chatLine(entry) {
  if (entry.system) return el('div', { className: 'chat-sys' }, t(entry.system, entry.vars ?? {}));
  const spectator = entry.role === 'spectator';
  return el('div', { className: `chat-msg${spectator ? ' spect' : ''}` },
    spectator ? el('span', { className: 'chat-tag' }, t('chat.spectatorTag')) : null,
    el('span', { className: 'chat-from' }, `${entry.from}: `),
    el('span', { className: 'chat-text' }, entry.text));
}

// `onSend(text)` ma zwrocic true, gdy wiadomosc poszla (wtedy czyscimy pole).
export function chatPanel({ log = [], onSend, title = true } = {}) {
  const list = el('div', { className: 'chat-list' });
  const empty = el('div', { className: 'chat-sys' }, t('chat.empty'));
  const input = el('input', { type: 'text', maxLength: CHAT.maxLen, placeholder: t('chat.placeholder'), className: 'chat-input' });
  const render = () => {
    if (!log.length) { list.replaceChildren(empty); return; }
    list.replaceChildren(...log.map(chatLine));
    // nowe wiadomosci na dole: zjezdzamy, o ile przegladarka w ogole to obsluguje (atrapa w testach nie)
    if (typeof list.scrollTop === 'number') list.scrollTop = 1e9;
  };
  render();
  const submit = () => {
    const text = input.value;
    if (!text.trim()) return;
    if (onSend?.(text) !== false) input.value = '';
  };
  const form = el('form', { className: 'chat-form', onsubmit: (e) => { e.preventDefault(); submit(); } },
    input, el('button', { type: 'submit', className: 'small' }, t('chat.send')));
  const node = el('section', { className: 'card chat' },
    title ? el('div', { className: 'section-head' }, el('span', { className: 'title' }, t('chat.title')), el('span', { className: 'rule' })) : null,
    list, form);
  return {
    node,
    push: (entry) => { log.push(entry); render(); },
    setLog: (entries) => { log = [...entries]; render(); },
    focus: () => input.focus?.(),
  };
}

function tierLines(kind, u) {
  return u.tiers.map((tier, i) => el('div', { className: 'ult-tier' }, el('b', {}, `${'I'.repeat(i + 1)}`), ` ${ultTier(kind, i, tier.desc)}`));
}

export function showLobby(msg, { difficulties, ultimates, icons, myId, onUlt, onDifficulty, onStart, onChat, onLeave = null, chatLog = [], spectator = false }) {
  const level = msg.difficulty;
  const name = el('div', { className: 'diff-name' });
  const desc = el('div', { className: 'muted' });
  const describe = (lv) => {
    name.textContent = `${lv}. ${bn('difficulty', lv, 'name', difficulties[lv - 1].name)}`;
    desc.textContent = bn('difficulty', lv, 'desc', difficulties[lv - 1].desc);
  };
  describe(level);
  const slider = el('input', {
    type: 'range', min: 1, max: 4, step: 1, value: level, disabled: !msg.youAreHost,
    oninput: (e) => describe(Number(e.target.value)),
    onchange: (e) => onDifficulty(Number(e.target.value)),
  });
  const players = el('ul', {}, ...msg.players.map((p) => el('li', { style: { color: p.color } },
    `${p.nick}${p.host ? t('lobby.host') : ''} · ${[p.ultKind, p.ultKind2].filter(Boolean).map((k) => bn('ultimate', k, 'name', ultimates[k].name)).join(' + ') || t('lobby.choosing')}${p.ultKind && !p.ultKind2 ? ' + ?' : ''}`)));
  const link = msg.room ? roomLink(msg.room) : null;
  const copy = link
    ? el('button', {
      type: 'button', className: 'copy',
      onclick: (e) => {
        navigator.clipboard?.writeText(link);
        e.target.textContent = t('lobby.copied');
        setTimeout(() => { e.target.textContent = t('lobby.copyLink'); }, 1500);
      },
    }, t('lobby.copyLink'))
    : null;
  const addresses = link
    ? el('div', {}, el('div', { className: 'room-code' }, msg.room), el('div', { className: 'muted' }, link), copy)
    : msg.addresses?.length
      ? el('ul', {}, ...msg.addresses.map((a) => el('li', {}, a)))
      : el('div', { className: 'muted' }, t('lobby.noLan'));
  // Dwa sloty (V3-Q-08): klik w wolny = pierwszy pusty slot; klik w wybrany = zdjecie; oba pelne = podmiana slotu 2.
  const allChosen = msg.players.every((p) => p.ultKind && p.ultKind2);
  const meRow = msg.players.find((p) => p.id === myId);
  const mine = meRow?.ultKind ?? null;
  const mine2 = meRow?.ultKind2 ?? null;
  const pick = (kind) => {
    if (kind === mine) return onUlt(null, 1);
    if (kind === mine2) return onUlt(null, 2);
    if (!mine) return onUlt(kind, 1);
    return onUlt(kind, 2);
  };
  const detail = el('div', { className: 'ult-detail' });
  const showDetail = (kind) => {
    if (!kind) {
      detail.replaceChildren(el('div', { className: 'muted' }, t('lobby.ultHint')));
      return;
    }
    const u = ultimates[kind];
    detail.replaceChildren(el('div', { className: 'ult-name' }, bn('ultimate', kind, 'name', u.name)), ...tierLines(kind, u));
  };
  showDetail(mine);
  const row = el('div', { className: 'ult-row' }, ...Object.entries(ultimates).map(([kind, u]) =>
    el('button', {
      className: `ult-tile${kind === mine ? ' sel' : ''}${kind === mine2 ? ' sel2' : ''}`, type: 'button',
      onclick: () => pick(kind), onmouseenter: () => showDetail(kind), onmouseleave: () => showDetail(mine),
    },
    kind === mine ? el('span', { className: 'slot-badge' }, 'F') : kind === mine2 ? el('span', { className: 'slot-badge two' }, 'C') : null,
    icons[kind] ? el('img', { className: 'ult-icon', src: icons[kind], alt: '' }) : null,
    el('div', { className: 'ult-name' }, bn('ultimate', kind, 'name', u.name)),
    el('div', { className: 'ult-blurb' }, bn('ultimate', kind, 'blurb', u.blurb)))));
  const chat = chatPanel({ log: chatLog, onSend: onChat });
  show(el('div', { className: 'panel lobby' },
    el('h2', {}, t('lobby.title')),
    el('div', { className: 'lobby-banner' }, t('lobby.banner')),
    el('div', { className: 'lobby-top' },
      el('div', {}, el('label', {}, t('lobby.players')), players,
        el('label', {}, msg.room ? t('lobby.invite') : t('lobby.joinLan')), addresses),
      el('div', {}, el('label', {}, t('lobby.difficulty')), slider, name, desc),
      chat.node),
    el('label', {}, t('lobby.ultLabel')), row, detail,
    el('div', { className: 'lobby-actions' },
      msg.youAreHost
        ? el('button', { onclick: onStart, disabled: !allChosen }, allChosen ? t('lobby.start') : t('lobby.startBlocked'))
        : el('p', { className: 'muted wait' }, t('lobby.waitHost')),
      onLeave ? el('button', { className: 'leave', onclick: onLeave }, t('lobby.leave')) : null),
  ));
  return chat;
}

export function showPause({ onResume, onFullscreen, onLeave, onControls, volume = 1, muted = false, onVolume, onMute }) {
  show(el('div', { className: 'panel' },
    el('h2', {}, t('pause.title')),
    el('p', { className: 'muted' }, t('pause.note')),
    el('label', { className: 'muted' }, t('home.volume'),
      el('input', {
        type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(volume * 100)),
        oninput: (ev) => onVolume?.(Number(ev.target.value) / 100),
      })),
    el('label', { className: 'muted' },
      el('input', { type: 'checkbox', checked: muted, onchange: (ev) => onMute?.(!!ev.target.checked) }),
      t('home.mute')),
    el('button', { onclick: onResume }, t('pause.resume')),
    el('button', { onclick: onFullscreen }, t('home.fullscreen')),
    el('button', { onclick: onControls }, t('home.controls')),
    el('button', { onclick: onLeave }, t('pause.leave')),
  ));
}

export function showResults(results, isHost, onLobby, leaderboard = null) {
  const rows = results.players.map((p) => el('tr', {},
    el('td', { style: { color: p.color } }, p.nick),
    el('td', {}, String(p.kills)),
    el('td', {}, String(p.downs ?? 0))));
  show(el('div', { className: 'panel' },
    el('h2', {}, t('results.title')),
    el('p', {}, t('results.summary', { wave: results.wave, time: formatTime(results.timeS) })),
    el('table', {}, el('tr', {}, el('th', {}, t('lb.player')), el('th', {}, t('results.kills')), el('th', {}, t('results.downs'))), ...rows),
    leaderboardPanel(leaderboard),
    isHost ? el('button', { onclick: onLobby }, t('results.toLobby')) : el('p', { className: 'muted' }, t('lobby.waitHost')),
  ));
}
