const root = () => document.getElementById('ui');

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function show(panel) {
  root().replaceChildren(panel);
  return panel;
}

export function formatTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function hideAll() {
  root().replaceChildren();
}

export function showMessage(text) {
  show(el('div', { className: 'panel msg' }, text));
}

const DIFF_NAMES = ['łatwy', 'normalny', 'trudny', 'koszmar'];

// Leaderboard przychodzi z serwera statystyk (wyniki liczy symulacja serwerowa,
// klient nie ma jak ich podrobić). Brak danych = panel się nie pokazuje.
export function leaderboardPanel(data) {
  if (!data || (!data.runs?.length && !data.players?.length)) return null;
  const body = el('div', {});
  const tabs = el('div', { className: 'lb-tabs' });
  const render = (which) => {
    for (const b of tabs.children) b.classList.toggle('sel', b.dataset.k === which);
    if (which === 'runs') {
      body.replaceChildren(el('table', { className: 'lb' },
        el('tr', {}, el('th', {}, '#'), el('th', {}, 'Fala'), el('th', {}, 'Czas'), el('th', {}, 'Zab.'), el('th', {}, 'Poziom'), el('th', {}, 'Gracze')),
        ...data.runs.map((r, i) => el('tr', {},
          el('td', {}, String(i + 1)),
          el('td', {}, String(r.wave)),
          el('td', {}, formatTime(r.timeS)),
          el('td', {}, String(r.kills)),
          el('td', { className: 'muted' }, DIFF_NAMES[r.difficulty - 1] ?? '?'),
          el('td', {}, (r.players ?? []).join(', '))))));
    } else {
      body.replaceChildren(el('table', { className: 'lb' },
        el('tr', {}, el('th', {}, '#'), el('th', {}, 'Gracz'), el('th', {}, 'Zab.'), el('th', {}, 'Partie'), el('th', {}, 'Najd. fala')),
        ...(data.players ?? []).map((r, i) => el('tr', {},
          el('td', {}, String(i + 1)),
          el('td', {}, r.nick),
          el('td', {}, String(r.kills)),
          el('td', {}, String(r.games)),
          el('td', {}, String(r.bestWave))))));
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
    `${p.nick}${p.host ? ' (host)' : ''} · ${p.ultKind ? ultimates[p.ultKind].name : 'wybiera ultimate…'}`)));
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
  const allChosen = msg.players.every((p) => p.ultKind);
  const mine = msg.players.find((p) => p.id === myId)?.ultKind;
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
      className: `ult-tile${kind === mine ? ' sel' : ''}`, type: 'button',
      onclick: () => onUlt(kind), onmouseenter: () => showDetail(kind), onmouseleave: () => showDetail(mine),
    },
    icons[kind] ? el('img', { className: 'ult-icon', src: icons[kind], alt: '' }) : null,
    el('div', { className: 'ult-name' }, u.name),
    el('div', { className: 'ult-blurb' }, u.blurb))));
  show(el('div', { className: 'panel lobby' },
    el('h2', {}, 'LOBBY'),
    el('div', { className: 'lobby-top' },
      el('div', {}, el('label', {}, 'Gracze'), players, el('label', {}, msg.room ? 'Zaproś' : 'Dołącz z sieci LAN'), addresses),
      el('div', {}, el('label', {}, 'Trudność'), slider, name, desc)),
    el('label', {}, 'Twój ULTIMATE [F]'), row, detail,
    msg.youAreHost
      ? el('button', { onclick: onStart, disabled: !allChosen }, allChosen ? 'Start' : 'Start (czekam na wybór ultimate)')
      : el('p', { className: 'muted' }, 'Czekam na hosta…'),
  ));
}

export function showPause({ onResume, onFullscreen, onLeave, volume = 1, muted = false, onVolume, onMute }) {
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
