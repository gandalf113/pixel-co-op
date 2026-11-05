const DEFAULT_GRACE_S = 30;
const DEFAULT_TIMEOUT_S = 6;
const PID_KEY = 'pixelcoop.pid';

function store(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {}
}

export function stored(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

// Anonimowy, trwały identyfikator przeglądarki. Serwer nigdy nie widzi tej
// wartości wprost — soli ją i hashuje, zanim trafi do statystyk. Służy tylko do
// odróżnienia "ktoś wrócił" od "ktoś nowy".
export function playerId() {
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!id) {
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      id = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(PID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export class Connection {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.nick = null;
    this.room = stored('room');
    this.token = stored('token');
    this.wanted = false;
    this.inGame = false;
    this.graceS = DEFAULT_GRACE_S;
    this.timeoutS = DEFAULT_TIMEOUT_S;
    this.lostAt = null;
    this.lastMsg = 0;
    this.retry = null;
    this.watchdog = setInterval(() => this.#checkTimeout(), 1000);
  }

  // room === null → serwer zakłada nowy pokój (tryb hostowany).
  // W trybie LAN pole jest ignorowane, bo sesja jest jedna.
  connect(nick, room = null) {
    this.nick = nick;
    store('nick', nick);
    if (room !== this.room) {
      this.token = null;
      store('token', null);
    }
    this.room = room;
    store('room', room);
    this.wanted = true;
    this.lostAt = null;
    this.#open();
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  leave() {
    this.send({ t: 'leave' });
    this.#stop();
    this.token = null;
    this.room = null;
    store('token', null);
    store('room', null);
  }

  #stop() {
    this.wanted = false;
    clearTimeout(this.retry);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  #open() {
    clearTimeout(this.retry);
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws`);
    this.ws = ws;
    this.onStatus('connecting');
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.lastMsg = Date.now();
      ws.send(JSON.stringify({ t: 'hello', nick: this.nick, token: this.token, room: this.room, pid: playerId() }));
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      this.lastMsg = Date.now();
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        this.token = msg.token;
        store('token', msg.token);
        if (msg.room) {
          this.room = msg.room;
          store('room', msg.room);
        }
        this.graceS = msg.balance?.session?.reconnectGraceS ?? DEFAULT_GRACE_S;
        this.timeoutS = msg.balance?.session?.timeoutS ?? DEFAULT_TIMEOUT_S;
        this.lostAt = null;
        this.onStatus('open');
      } else if (msg.t === 'reject') {
        this.token = null;
        this.room = null;
        store('token', null);
        store('room', null);
        this.#stop();
        this.onStatus('rejected', msg.reason);
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (ws !== this.ws || !this.wanted) return;
      this.lostAt ??= Date.now();
      if (Date.now() - this.lostAt > this.graceS * 1000) {
        this.#stop();
        this.onStatus('rejected', 'Utracono połączenie');
        return;
      }
      this.onStatus('lost');
      this.retry = setTimeout(() => this.#open(), 1000);
    };
  }

  #checkTimeout() {
    const ws = this.ws;
    if (!this.inGame || ws?.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastMsg > this.timeoutS * 1000) ws.close();
  }
}
