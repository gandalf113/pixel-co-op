const MOVE = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
const EDGE = { KeyE: 'e', KeyR: 'r', KeyQ: 'q', KeyG: 'g', KeyF: 'f', Escape: 'esc', F3: 'debug' };

// Kółko generuje serię zdarzeń przy gładkim scrollu; jedno "kliknięcie" = jeden obrót.
const WHEEL_THROTTLE_MS = 120;

export class InputState {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.down = new Set();
    this.fire = false;
    this.lastWheel = -Infinity;
    this.mouse = { x: 0, y: 0 };
    this.handlers = [];
    addEventListener('keydown', (e) => this.#key(e, true));
    addEventListener('keyup', (e) => this.#key(e, false));
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    addEventListener('blur', () => this.clear());
    canvasEl.ownerDocument.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.#fromGame(e)) this.fire = true;
      else if (e.button === 2) this.#emit('next', true);
    });
    canvasEl.ownerDocument.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
    });
    canvasEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const t = performance.now();
      if (t - this.lastWheel < WHEEL_THROTTLE_MS) return;
      this.lastWheel = t;
      this.#emit('q', true);
    }, { passive: false });
    canvasEl.ownerDocument.addEventListener('contextmenu', (e) => {
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    });
  }

  // LPM w panelach UI (#ui, formularze) nie może strzelać.
  #fromGame(e) {
    const t = e.target;
    if (!(t instanceof Element)) return true;
    return !t.closest('#ui, input, textarea, select, button');
  }

  #key(e, isDown) {
    if (e.target instanceof HTMLInputElement) return;
    const code = e.code;
    if (code === 'Space' || code === 'Tab' || code === 'F3') e.preventDefault();
    if (code === 'Space') this.fire = isDown;
    else if (code in MOVE) {
      isDown ? this.down.add(code) : this.down.delete(code);
      if (isDown && !e.repeat && code === 'KeyA') this.#emit('prev', true);
      if (isDown && !e.repeat && code === 'KeyD') this.#emit('next', true);
    }
    else if (code === 'Tab') {
      if (!(isDown && e.repeat)) this.#emit('tab', isDown);
    } else if (code in EDGE && isDown && !e.repeat) this.#emit(EDGE[code], true);
  }

  #emit(action, isDown) {
    for (const cb of this.handlers) cb(action, isDown);
  }

  sample() {
    let mx = 0;
    let my = 0;
    for (const code of this.down) {
      mx += MOVE[code][0];
      my += MOVE[code][1];
    }
    return { mx, my, fire: this.fire };
  }

  aimScreen() {
    const r = this.canvas.getBoundingClientRect();
    return { x: this.mouse.x - r.left, y: this.mouse.y - r.top };
  }

  onAction(cb) {
    this.handlers.push(cb);
  }

  clear() {
    this.down.clear();
    this.fire = false;
    this.#emit('tab', false);
  }
}
