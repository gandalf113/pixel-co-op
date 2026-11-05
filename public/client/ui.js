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

export function showNickForm(onSubmit, initial = '') {
  const input = el('input', { type: 'text', maxLength: 12, value: initial, placeholder: 'nick', autofocus: true });
  const form = el('form', {
    onsubmit: (e) => {
      e.preventDefault();
      const nick = input.value.trim();
      if (nick) onSubmit(nick);
    },
  }, el('h1', {}, 'LAN CO-OP'), el('label', {}, 'Twój nick'), input, el('button', { type: 'submit' }, 'Dołącz'));
  show(el('div', { className: 'panel' }, form));
  input.focus();
}

function ultPicker(msg, ultimates, myId, onUlt) {
  const mine = msg.players.find((p) => p.id === myId)?.ultKind;
  return el('div', { className: 'ult-grid' }, ...Object.entries(ultimates).map(([kind, u]) =>
    el('button', { className: `ult-tile${kind === mine ? ' sel' : ''}`, type: 'button', onclick: () => onUlt(kind) },
      el('div', { className: 'ult-icon' }, u.icon),
      el('div', { className: 'ult-name' }, u.name),
      ...u.tiers.map((t, i) => el('div', { className: 'ult-tier' }, `${'I'.repeat(i + 1)}: ${t.desc}`)),
    )));
}

export function showLobby(msg, { difficulties, ultimates, myId, onUlt, onDifficulty, onStart }) {
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
    `${p.nick}${p.host ? ' (host)' : ''} · ${p.ultKind ? `${ultimates[p.ultKind].icon} ${ultimates[p.ultKind].name}` : 'wybiera ultimate…'}`)));
  const allChosen = msg.players.every((p) => p.ultKind);
  const addresses = msg.addresses?.length
    ? el('ul', {}, ...msg.addresses.map((a) => el('li', {}, a)))
    : el('div', { className: 'muted' }, 'brak adresów LAN');
  show(el('div', { className: 'panel' },
    el('h2', {}, 'LOBBY'),
    el('label', {}, 'Gracze'), players,
    el('label', {}, 'Dołącz z sieci LAN'), addresses,
    el('label', {}, 'Trudność'), slider, name, desc,
    el('label', {}, 'Twój ULTIMATE [F]'), ultPicker(msg, ultimates, myId, onUlt),
    msg.youAreHost
      ? el('button', { onclick: onStart, disabled: !allChosen, title: allChosen ? '' : 'Każdy musi wybrać ultimate' }, allChosen ? 'Start' : 'Start (czekam na wybór ultimate)')
      : el('p', { className: 'muted' }, 'Czekam na hosta…'),
  ));
}

export function showPause({ onResume, onFullscreen, onLeave }) {
  show(el('div', { className: 'panel' },
    el('h2', {}, 'PAUZA'),
    el('p', { className: 'muted' }, 'Gra trwa dalej.'),
    el('button', { onclick: onResume }, 'Wróć'),
    el('button', { onclick: onFullscreen }, 'Pełny ekran'),
    el('button', { onclick: onLeave }, 'Wyjdź'),
  ));
}

export function showResults(results, isHost, onLobby) {
  const rows = results.players.map((p) => el('tr', {}, el('td', { style: { color: p.color } }, p.nick), el('td', {}, String(p.kills))));
  show(el('div', { className: 'panel' },
    el('h2', {}, 'KONIEC GRY'),
    el('p', {}, `Fala: ${results.wave} · czas: ${formatTime(results.timeS)}`),
    el('table', {}, el('tr', {}, el('th', {}, 'Gracz'), el('th', {}, 'Zabójstwa')), ...rows),
    isHost ? el('button', { onclick: onLobby }, 'Do lobby') : el('p', { className: 'muted' }, 'Czekam na hosta…'),
  ));
}
