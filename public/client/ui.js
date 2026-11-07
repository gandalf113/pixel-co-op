import { drawControls, CONTROLS_SIZE } from './controls.js';
import { drawLogo, logoSize } from './logo.js';
import { COLORS } from '../shared/protocol.js';
import { BESTIARY, TIPS, NEWS } from './content.js';

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

const DIFF_NAMES = ['łatwy', 'normalny', 'trudny', 'koszmar'];

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
        el('tr', {}, el('th', {}, '#'), el('th', {}, 'Fala'), el('th', {}, 'Czas'), el('th', {}, 'Zab.'), el('th', {}, 'Poziom'), el('th', {}, 'Gracze')),
        ...data.runs.slice(0, limit).map((r, i) => el('tr', { className: nick && (r.players ?? []).includes(nick) ? 'me' : '' },
          el('td', {}, String(i + 1)),
          el('td', {}, String(r.wave)),
          el('td', {}, formatTime(r.timeS)),
          el('td', {}, String(r.kills)),
          el('td', { className: 'muted' }, DIFF_NAMES[r.difficulty - 1] ?? '?'),
          el('td', {}, (r.players ?? []).join(', '))))));
    } else {
      body.replaceChildren(el('table', { className: 'lb' },
        el('tr', {}, el('th', {}, '#'), el('th', {}, 'Gracz'), el('th', {}, 'Zab.'), el('th', {}, 'Partie'), el('th', {}, 'Najd. fala')),
        ...(data.players ?? []).slice(0, limit).map((r, i) => el('tr', { className: r.nick === nick ? 'me' : '' },
          el('td', {}, String(i + 1)),
          el('td', {}, r.nick),
          el('td', {}, String(r.kills)),
          el('td', {}, String(r.games)),
          el('td', {}, String(r.bestWave))))));
      // Twoje miejsce, gdy nie miescisz sie w limicie.
      const idx = nick ? (data.players ?? []).findIndex((r) => r.nick === nick) : -1;
      if (idx >= limit) body.append(el('div', { className: 'muted lb-me' }, `Ty: miejsce ${idx + 1}`));
    }
  };
  for (const [k, label] of [['runs', 'Przebiegi'], ['players', 'Gracze']]) {
    const btn = el('button', { type: 'button', className: 'lb-tab', onclick: () => render(k) }, label);
    btn.dataset.k = k;
    tabs.append(btn);
  }
  render('runs');
  return el('div', { className: 'lb-wrap' }, el('label', {}, 'Leaderboard'), tabs, body);
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
  const nickInput = el('input', { type: 'text', maxLength: 12, value: nick, placeholder: 'nick', autofocus: true });
  const codeInput = el('input', { type: 'text', maxLength: 8, value: room, placeholder: 'puste = nowy pokój', className: 'code' });
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
  el('h1', {}, 'PIXEL CO-OP'),
  el('label', {}, 'Twój nick'), nickInput,
  rooms ? el('label', {}, 'Kod pokoju') : null,
  rooms ? codeInput : null,
  el('button', { type: 'submit' }, rooms ? 'Dołącz / nowy pokój' : 'Dołącz'),
  error);
  const board = leaderboardPanel(leaderboard);
  show(el('div', { className: `panel${board ? ' wide' : ''}` }, form, board));
  nickInput.focus();
  return { error: (text) => { error.textContent = text ?? ''; } };
}

// K-02, krok 1: sam nick.
export function showNickScreen({ nick = '' } = {}, onSubmit) {
  const input = el('input', { type: 'text', maxLength: 12, value: nick, placeholder: 'nick', autofocus: true });
  const error = el('div', { className: 'muted' });
  show(el('div', { className: 'panel' },
    el('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const n = input.value.trim();
        if (n) onSubmit(n);
      },
    },
    el('h1', {}, 'PIXEL CO-OP'),
    el('label', {}, 'Twój nick'), input,
    el('button', { type: 'submit' }, 'Dalej'),
    error)));
  input.focus();
  return { error: (text) => { error.textContent = text ?? ''; } };
}

// Jeden wiersz listy pokoi. Wiersz jest klikalny tylko wtedy, gdy da się wejść.
export function roomRowInfo(r) {
  const full = r.players >= r.maxPlayers;
  const lines = [`${r.players} / ${r.maxPlayers} graczy`];
  if (r.inGame) lines.push(`mecz w toku · fala ${r.wave}`);
  else if (full) lines.push('pełny');
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
  if (s < 60) return `${Math.max(0, Math.round(s))} s temu`;
  return `${Math.floor(s / 60)} min temu`;
}

// Karta pokoju: kod, cztery sloty (zajety = sprite gracza w kolorze slotu), opis. Klikalna tylko, gdy da sie wejsc.
function roomCard(r, sprites, onJoin) {
  const info = roomRowInfo(r);
  const slots = el('div', { className: 'slots' }, ...Array.from({ length: r.maxPlayers }, (_, i) => {
    const taken = i < r.players;
    const img = taken ? spriteImg(sprites, `player_0@${COLORS[i % COLORS.length]}`, 'slot-img', 2) : null;
    return el('div', { className: `slot${taken ? ' taken' : ''}`, style: taken ? { borderColor: COLORS[i % COLORS.length] } : {} }, img);
  }));
  // B2 (V3-K-08): karta dwuwierszowa - kod, sloty, Wejdz / plakietka; pod spodem opis i wiek pokoju.
  const tag = info.joinable ? el('span', { className: 'enter' }, 'Wejdź')
    : el('span', { className: 'badge' }, r.inGame ? 'w toku' : 'pełny');
  const row = el('li', { className: `room-row${info.joinable ? '' : ' closed'}` },
    el('div', { className: 'room-top' }, el('span', { className: 'room-code-s' }, r.code), slots, el('span', { className: 'spacer' }), tag),
    el('span', { className: 'room-info' }, `${info.text}${r.inGame ? '' : ' · lobby'} · ${formatAge(r.ageS)}`));
  if (info.joinable) {
    row.classList.toggle('join', true);
    row.addEventListener('click', () => onJoin(r.code));
  }
  return row;
}

// K-02, krok 2 / V3-K-06: ekran główny. `rooms` = tablica | null (nie wiadomo / tryb LAN); lan = bez listy.
// Opcje poza wymaganymi: color (kolor bohatera), sprites (Map z bakeSprites), version, online {players, rooms},
// audio {volume, muted}. Callbacki poza wymaganymi sa opcjonalne.
export function showHome({ nick = '', lan = false, rooms = null, leaderboard = null, message = '', color = COLORS[0], sprites = null, version = null, online = null, audio = null },
  { onJoin, onNew, onPlay, onControls, onChangeNick, onVolume, onMute, onFullscreen }) {
  const list = el('ul', { className: 'rooms' });
  const note = el('div', { className: 'muted note' }, message);
  const count = el('span', { className: 'muted count' });
  let joinable = [];
  const setRooms = (data) => {
    joinable = Array.isArray(data) ? data.filter((r) => roomRowInfo(r).joinable) : [];
    count.textContent = Array.isArray(data) ? `${data.length} ${data.length === 1 ? 'otwarty' : 'otwartych'} · ${joinable.length} z miejscem` : '';
    if (!Array.isArray(data)) {
      list.replaceChildren(el('li', { className: 'muted' }, 'lista pokojów niedostępna'));
      return;
    }
    if (!data.length) {
      list.replaceChildren(el('li', { className: 'muted' }, 'brak otwartych pokojów — załóż własny'));
      return;
    }
    list.replaceChildren(...data.map((r) => roomCard(r, sprites, onJoin)));
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
    el('label', { className: 'muted' }, 'Głośność',
      el('input', {
        type: 'range', min: '0', max: '100', step: '1', value: String(Math.round((audio?.volume ?? 0.7) * 100)),
        oninput: (ev) => onVolume?.(Number(ev.target.value) / 100),
      })),
    el('label', { className: 'muted' },
      el('input', { type: 'checkbox', checked: !!audio?.muted, onchange: (ev) => onMute?.(!!ev.target.checked) }),
      ' Wycisz'),
    el('button', { className: 'small', onclick: () => onFullscreen?.() }, 'Pełny ekran'));
  const me = el('section', { className: 'card me' },
    el('div', { className: 'hero' }, spriteImg(sprites, `player_0@${color}`, 'hero-img', 4)),
    el('div', { className: 'nick', style: { color } }, nick),
    el('a', { className: 'link', onclick: onChangeNick }, 'zmień nick'),
    el('div', { className: 'stats' }, stat('najd. fala', mine?.bestWave), stat('zabójstw', mine?.kills), stat('partii', mine?.games)));

  const playBlock = el('div', { className: 'play' },
    el('button', { className: 'big', onclick: play }, 'GRAJ'),
    el('div', { className: 'muted small center' }, lan ? 'dołącza do gry na tym serwerze' : 'pierwszy pokój z miejscem albo nowy'),
    el('div', { className: 'row' },
      el('button', { onclick: onControls }, 'Sterowanie'),
      el('button', { onclick: () => { settings.hidden = !settings.hidden; } }, 'Ustawienia')),
    settings,
    note);

  const board = leaderboardPanel(leaderboard, { limit: 6, nick });
  const boardCol = el('section', { className: 'card board' }, board ?? el('div', { className: 'muted' }, 'Leaderboard pojawi się po pierwszej partii.'));

  // B2 (V3-K-08): POKOJE jako osobna sekcja w zlotej ramce: naglowek z licznikiem i "Nowy pokoj", siatka kart.
  const roomsSection = lan ? null : el('section', { className: 'card rooms-section' },
    el('div', { className: 'section-head' },
      el('span', { className: 'title' }, 'POKOJE'), el('span', { className: 'rule' }), count,
      el('button', { className: 'small', onclick: onNew }, '+ Nowy pokój')),
    list);

  // Bestiariusz: sprite'y potworow, po najechaniu jedno zdanie.
  const blurb = el('div', { className: 'muted blurb' }, 'Najedź na potwora.');
  const beast = el('div', { className: 'bestiary' }, ...BESTIARY.map(([type, name, text]) => {
    const tile = el('div', { className: 'beast' }, spriteImg(sprites, `${type}_0`, 'beast-img', 2), el('div', { className: 'beast-name' }, name));
    tile.addEventListener('mouseenter', () => { blurb.textContent = `${name}: ${text}`; });
    return tile;
  }));

  // Stopka: porada (rotowana przez main.js przez tick()), puls serwera, wersja, co nowego.
  let tipIdx = Math.floor(Math.random() * TIPS.length);
  const tip = el('div', { className: 'tip' }, TIPS[tipIdx]);
  const pulse = el('span', { className: 'muted' });
  const setOnline = (o) => {
    pulse.textContent = o && Number.isFinite(o.players) ? `online: ${o.players} · pokoje: ${o.rooms ?? 0}` : '';
  };
  setOnline(online);
  const news = el('div', { className: 'news', hidden: true }, ...NEWS.map(([v, text]) => el('div', {}, el('b', {}, `v${v}`), ` ${text}`)));
  const newsLink = el('a', { className: 'link', onclick: () => { news.hidden = !news.hidden; } }, 'co nowego');
  const foot = el('div', { className: 'home-foot' }, tip, el('div', { className: 'muted' }, pulse, version ? ` · v${version} · ` : ' · ', newsLink), news);

  const beastCard = el('section', { className: 'card beast-card' }, el('label', {}, 'Bestiariusz'), beast, blurb);
  show(el('div', { className: 'panel home' },
    el('div', { className: 'home-left' }, logoCanvas(), me, playBlock, boardCol, foot),
    el('div', { className: 'home-right' }, roomsSection, beastCard)));
  return {
    setRooms,
    setOnline,
    message: (text) => { note.textContent = text ?? ''; },
    tick: () => { tipIdx = (tipIdx + 1) % TIPS.length; tip.textContent = TIPS[tipIdx]; },
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
    el('h2', {}, 'STEROWANIE'),
    el('p', { className: 'muted' }, 'Poligon: wypróbuj na żywo. Bohater po lewej reaguje na klawisze, ściana obok jest do podniesienia, ślimak do zestrzelenia.'),
    canvas,
    el('div', {}, el('button', { onclick: onBack }, 'Wróć'), el('span', { className: 'muted' }, ' albo Esc'))), { side: true });
  return { setPressed };
}

export function showNickForm(onSubmit, initial = '') {
  return showJoinForm({ nick: initial }, (nick) => onSubmit(nick));
}

function tierLines(u) {
  return u.tiers.map((t, i) => el('div', { className: 'ult-tier' }, el('b', {}, `${'I'.repeat(i + 1)}`), ` ${t.desc}`));
}

export function showLobby(msg, { difficulties, ultimates, icons, myId, onUlt, onDifficulty, onStart }) {
  const level = msg.difficulty;
  const name = el('div', { className: 'diff-name' });
  const desc = el('div', { className: 'muted' });
  const describe = (lv) => {
    name.textContent = `${lv}. ${difficulties[lv - 1].name}`;
    desc.textContent = difficulties[lv - 1].desc;
  };
  describe(level);
  const slider = el('input', {
    type: 'range', min: 1, max: 4, step: 1, value: level, disabled: !msg.youAreHost,
    oninput: (e) => describe(Number(e.target.value)),
    onchange: (e) => onDifficulty(Number(e.target.value)),
  });
  const players = el('ul', {}, ...msg.players.map((p) => el('li', { style: { color: p.color } },
    `${p.nick}${p.host ? ' (host)' : ''} · ${[p.ultKind, p.ultKind2].filter(Boolean).map((k) => ultimates[k].name).join(' + ') || 'wybiera ultimate…'}${p.ultKind && !p.ultKind2 ? ' + ?' : ''}`)));
  const link = msg.room ? roomLink(msg.room) : null;
  const copy = link
    ? el('button', {
      type: 'button', className: 'copy',
      onclick: (e) => {
        navigator.clipboard?.writeText(link);
        e.target.textContent = 'skopiowano';
        setTimeout(() => { e.target.textContent = 'kopiuj link'; }, 1500);
      },
    }, 'kopiuj link')
    : null;
  const addresses = link
    ? el('div', {}, el('div', { className: 'room-code' }, msg.room), el('div', { className: 'muted' }, link), copy)
    : msg.addresses?.length
      ? el('ul', {}, ...msg.addresses.map((a) => el('li', {}, a)))
      : el('div', { className: 'muted' }, 'brak adresów LAN');
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
      detail.replaceChildren(el('div', { className: 'muted' }, 'Wybierz ultimate, najedź, żeby zobaczyć progi.'));
      return;
    }
    const u = ultimates[kind];
    detail.replaceChildren(el('div', { className: 'ult-name' }, u.name), ...tierLines(u));
  };
  showDetail(mine);
  const row = el('div', { className: 'ult-row' }, ...Object.entries(ultimates).map(([kind, u]) =>
    el('button', {
      className: `ult-tile${kind === mine ? ' sel' : ''}${kind === mine2 ? ' sel2' : ''}`, type: 'button',
      onclick: () => pick(kind), onmouseenter: () => showDetail(kind), onmouseleave: () => showDetail(mine),
    },
    kind === mine ? el('span', { className: 'slot-badge' }, 'F') : kind === mine2 ? el('span', { className: 'slot-badge two' }, 'C') : null,
    icons[kind] ? el('img', { className: 'ult-icon', src: icons[kind], alt: '' }) : null,
    el('div', { className: 'ult-name' }, u.name),
    el('div', { className: 'ult-blurb' }, u.blurb))));
  show(el('div', { className: 'panel lobby' },
    el('h2', {}, 'LOBBY'),
    el('div', { className: 'lobby-top' },
      el('div', {}, el('label', {}, 'Gracze'), players, el('label', {}, msg.room ? 'Zaproś' : 'Dołącz z sieci LAN'), addresses),
      el('div', {}, el('label', {}, 'Trudność'), slider, name, desc)),
    el('label', {}, 'Twoje DWA ULTIMATE: pierwszy [F], drugi [C] · jeden wspólny pasek'), row, detail,
    msg.youAreHost
      ? el('button', { onclick: onStart, disabled: !allChosen }, allChosen ? 'Start' : 'Start (każdy wybiera dwa ultimate)')
      : el('p', { className: 'muted' }, 'Czekam na hosta…'),
  ));
}

export function showPause({ onResume, onFullscreen, onLeave, onControls, volume = 1, muted = false, onVolume, onMute }) {
  show(el('div', { className: 'panel' },
    el('h2', {}, 'PAUZA'),
    el('p', { className: 'muted' }, 'Gra trwa dalej.'),
    el('label', { className: 'muted' }, 'Głośność',
      el('input', {
        type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(volume * 100)),
        oninput: (ev) => onVolume?.(Number(ev.target.value) / 100),
      })),
    el('label', { className: 'muted' },
      el('input', { type: 'checkbox', checked: muted, onchange: (ev) => onMute?.(!!ev.target.checked) }),
      ' Wycisz'),
    el('button', { onclick: onResume }, 'Wróć'),
    el('button', { onclick: onFullscreen }, 'Pełny ekran'),
    el('button', { onclick: onControls }, 'Sterowanie'),
    el('button', { onclick: onLeave }, 'Wyjdź'),
  ));
}

export function showResults(results, isHost, onLobby, leaderboard = null) {
  const rows = results.players.map((p) => el('tr', {},
    el('td', { style: { color: p.color } }, p.nick),
    el('td', {}, String(p.kills)),
    el('td', {}, String(p.downs ?? 0))));
  show(el('div', { className: 'panel' },
    el('h2', {}, 'KONIEC GRY'),
    el('p', {}, `Fala: ${results.wave} · czas: ${formatTime(results.timeS)}`),
    el('table', {}, el('tr', {}, el('th', {}, 'Gracz'), el('th', {}, 'Zabójstwa'), el('th', {}, 'Upadki')), ...rows),
    leaderboardPanel(leaderboard),
    isHost ? el('button', { onclick: onLobby }, 'Do lobby') : el('p', { className: 'muted' }, 'Czekam na hosta…'),
  ));
}
