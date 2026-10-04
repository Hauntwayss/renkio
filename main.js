/* ============ 1. SABİTLER ============ */
const COLS = 16, ROWS = 12, STEP = 110, COUNTDOWN = 3;
const DASH_CD = 15000, DASH_LEN = 4;
const EMPTY = '#232323', PREFIX = 'renkio-', CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0]
};
const PEER_OPTS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:global.relay.metered.ca:80', username: 'ee05620ec11d720751fab38e', credential: 'X3k6o/sAj55qxGAb' },
      { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'ee05620ec11d720751fab38e', credential: 'X3k6o/sAj55qxGAb' },
      { urls: 'turn:global.relay.metered.ca:443', username: 'ee05620ec11d720751fab38e', credential: 'X3k6o/sAj55qxGAb' },
      { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'ee05620ec11d720751fab38e', credential: 'X3k6o/sAj55qxGAb' }
    ]
  }
};

/* Haritalar: # duvar, . boş (16x12) */
const MAPS = [
  Array(12).fill('................'),
  ['................', '................', '...##......##...', '...##......##...', '................', '......####......',
   '......####......', '................', '...##......##...', '...##......##...', '................', '................'],
  ['................', '..###..##..###..', '................', '.#..#......#..#.', '.#..#..##..#..#.', '....#..##..#....',
   '....#..##..#....', '.#..#..##..#..#.', '.#..#......#..#.', '................', '..###..##..###..', '................']
];
const PU_COL = { b: '#ff7b3c', i: '#7ad7ff', s: '#ffe14d' };

/* Skin seçenekleri */
const PAL = ['#ff4d6d', '#3ddcff', '#ffd93d', '#6bff6b', '#c77dff', '#ff9a3c', '#ffffff', '#ff6bd6',
             '#2ee6a8', '#4d7cff', '#a3e635', '#9ca3af'];
const HATS = [['none', 'Yok'], ['crown', 'Taç'], ['party', 'Parti'], ['cap', 'Kep'], ['horns', 'Boynuz'],
  ['halo', 'Hale'], ['wizard', 'Büyücü'], ['ears', 'Kedi'], ['antenna', 'Anten'], ['cowboy', 'Kovboy']];
const EYES = [['n', 'Normal'], ['h', 'Mutlu'], ['c', 'Havalı'], ['a', 'Kızgın'], ['z', 'Uykulu'], ['w', 'Göz kırpan']];
const PATS = [['n', 'Düz'], ['s', 'Çizgili'], ['d', 'Benekli'], ['x', 'İki renk']];
const TILES = [['s', 'Düz'], ['i', 'Çerçeveli'], ['d', 'Noktalı']];
const pick = (list, v, def) => list.some(o => o[0] === v) ? v : def;
const cleanSkin = s => {
  s = s || {};
  return {
    c: PAL.includes(s.c) ? s.c : PAL[0],
    h: pick(HATS, s.h, 'none'), e: pick(EYES, s.e, 'n'),
    p: pick(PATS, s.p, 'n'), t: pick(TILES, s.t, 's')
  };
};
const DEF2 = { c: PAL[1], h: 'none', e: 'n', p: 'n', t: 's' };

/* ============ 2. DURUM ============ */
let peer = null, conn = null, isHost = false, screen = 'menu';
let names = ['', ''], ready = false, secs = 60, mapI = 0, wins = [0, 0];
let sim = null, snap = null, loopOn = false;
let cell = 32, sendT = 0, lastOv = '', stack = [];
let skin = (() => { try { return cleanSkin(JSON.parse(localStorage.getItem('renkio-skin'))); } catch (e) { return cleanSkin(); } })();
let skins = [skin, DEF2];
const dp = [[0, 0], [0, 0]];

/* ============ 3. YARDIMCILAR ============ */
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const send = m => conn && conn.open && conn.send(m);

function show(name) {
  screen = name;
  ['menu', 'room', 'game'].forEach(s => $(s).classList.toggle('hide', s !== name));
  if (name === 'game') resize();
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 2600);
}
function setErr(m) { $('err').textContent = m || ''; }
function genCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CHARS[Math.floor(Math.random() * CHARS.length)];
  return c;
}
function applyColors() {
  document.documentElement.style.setProperty('--c0', skins[0].c);
  document.documentElement.style.setProperty('--c1', skins[1].c);
}

/* ============ 3B. SES EFEKTLERİ ============ */
const SFX = (() => {
  let ac = null, muted = false;
  try { muted = localStorage.getItem('renkio-mute') === '1'; } catch (e) {}
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0, slide = 0) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    unlock: audio,
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('renkio-mute', muted ? '1' : '0'); } catch (e) {}
      return muted;
    },
    click()  { tone(620, 0.05, 'sine', 0.08); tone(820, 0.05, 'sine', 0.06, 0.03); },
    paint()  { tone(520, 0.07, 'triangle', 0.09, 0, 1.5); },
    steal()  { tone(320, 0.12, 'sawtooth', 0.06, 0, 2); tone(640, 0.09, 'square', 0.05, 0.05); },
    dash(v = 0.1) { tone(260, 0.2, 'sawtooth', v, 0, 4); tone(900, 0.12, 'triangle', v * 0.6, 0.05, 0.5); },
    dashReady() { tone(980, 0.06, 'sine', 0.08); tone(1320, 0.1, 'sine', 0.08, 0.06); },
    bomb()   { tone(120, 0.3, 'sawtooth', 0.14, 0, 0.3); tone(80, 0.3, 'square', 0.08, 0.05); },
    freeze() { [1200, 900, 700].forEach((f, i) => tone(f, 0.12, 'sine', 0.1, i * 0.07)); },
    speed()  { tone(500, 0.18, 'square', 0.07, 0, 2.5); },
    count()  { tone(440, 0.12, 'sine', 0.14); },
    go()     { tone(660, 0.14, 'square', 0.08); tone(990, 0.26, 'square', 0.08, 0.12); },
    tick()   { tone(880, 0.07, 'square', 0.06); },
    win()    { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, i * 0.12)); },
    lose()   { [392, 330, 262].forEach((f, i) => tone(f, 0.28, 'triangle', 0.13, i * 0.16)); },
    draw()   { tone(440, 0.2, 'triangle', 0.12); tone(440, 0.25, 'triangle', 0.12, 0.22); },
    msg()    { tone(700, 0.08, 'sine', 0.1); tone(900, 0.1, 'sine', 0.1, 0.07); }
  };
})();

['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => SFX.unlock(), { once: true }));
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button');
  if (b && !b.disabled) SFX.click();
});

(function () {                                          // ses butonu
  const st = document.createElement('style');
  st.textContent = '#mute{position:fixed;right:16px;bottom:16px;padding:10px 16px;border-radius:22px;font-size:12px;z-index:5}';
  document.head.append(st);
  const b = document.createElement('button');
  b.id = 'mute';
  const label = () => b.textContent = SFX.muted ? 'Ses: Kapalı' : 'Ses: Açık';
  label();
  b.onclick = () => { SFX.toggle(); label(); b.blur(); };
  document.body.append(b);
})();

(function () {                                          // dash barı
  const st = document.createElement('style');
  st.textContent =
    '#dash{width:100%;display:flex;align-items:center;gap:12px;font-size:12px;font-weight:700;letter-spacing:1px;color:var(--mut)}' +
    '#dash .track{flex:1;height:8px;border-radius:6px;background:#242424;overflow:hidden}' +
    '#dash .track i{display:block;height:100%;width:100%;background:var(--blue)}' +
    '#dash.rdy{color:#4ade80}#dash.rdy .track i{background:#4ade80}#dashTxt{min-width:110px;text-align:right}';
  document.head.append(st);
  const d = document.createElement('div');
  d.id = 'dash';
  d.innerHTML = '<span>DASH</span><div class="track"><i id="dashFill"></i></div><span id="dashTxt">SPACE</span>';
  $('game').insertBefore(d, document.querySelector('.hint'));
  document.querySelector('.hint').textContent = 'WASD / ok tuşları  |  SPACE: Dash  |  Enter: sohbet  |  Haritadaki toplar: bomba, buz, hız';
})();

/* ============ 3C. ÇİZİM YARDIMCILARI ============ */
function rr(x, y, w, h, r, c = ctx) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
function poly(c, pts, color) {
  c.fillStyle = color; c.beginPath();
  pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
  c.closePath(); c.fill();
}

/* Güç topu ikonları (emoji yok, kodla çizilir) */
function icon(c, k, cx, cy, r) {
  if (k === 'b') {
    circ(c, cx, cy + r * 0.15, r * 0.62, '#222');
    circ(c, cx - r * 0.2, cy - r * 0.05, r * 0.14, '#ffffff55');
    c.strokeStyle = '#bbb'; c.lineWidth = r * 0.12; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx + r * 0.3, cy - r * 0.4); c.lineTo(cx + r * 0.6, cy - r * 0.75); c.stroke();
    circ(c, cx + r * 0.62, cy - r * 0.8, r * 0.16, '#ffb703');
  } else if (k === 'i') {
    c.strokeStyle = '#d4f1ff'; c.lineWidth = r * 0.16; c.lineCap = 'round';
    for (let a = 0; a < 3; a++) {
      const t = a * Math.PI / 3;
      c.beginPath();
      c.moveTo(cx - Math.cos(t) * r * 0.8, cy - Math.sin(t) * r * 0.8);
      c.lineTo(cx + Math.cos(t) * r * 0.8, cy + Math.sin(t) * r * 0.8); c.stroke();
    }
    circ(c, cx, cy, r * 0.2, '#fff');
  } else {
    poly(c, [[0.15, -0.85], [-0.5, 0.1], [-0.05, 0.1], [-0.2, 0.85], [0.5, -0.2], [0.05, -0.2]]
      .map(p => [cx + p[0] * r, cy + p[1] * r]), '#ffe14d');
  }
}

/* ============ 3D. KARAKTER ÇİZİMİ ============ */
function eyeNormal(c, ex, ey, er, d) {
  circ(c, ex, ey, er, '#fff');
  circ(c, ex + d[0] * er * 0.5, ey + d[1] * er * 0.5, er * 0.5, '#111');
}
function eyeHappy(c, ex, ey, er, s) {
  c.strokeStyle = '#111'; c.lineWidth = s * 0.06; c.lineCap = 'round';
  c.beginPath(); c.arc(ex, ey + er * 0.6, er, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
}

function drawChar(c, x, y, s, k, d) {
  c.save(); c.shadowColor = k.c; c.shadowBlur = s * 0.6;
  c.fillStyle = '#fff'; rr(x, y, s, s, s * 0.3, c); c.restore();
  c.fillStyle = k.c; rr(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.22, c);

  if (k.p !== 'n') {                                    // desen
    c.save(); c.beginPath(); c.roundRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.22); c.clip();
    c.fillStyle = '#00000033';
    if (k.p === 's') for (let i = 0; i < 4; i++) c.fillRect(x + s * (0.12 + i * 0.22), y, s * 0.1, s);
    else if (k.p === 'x') c.fillRect(x, y + s * 0.6, s, s);
    else for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      c.beginPath(); c.arc(x + s * (0.22 + i * 0.19), y + s * (0.66 + j * 0.17), s * 0.04, 0, 7); c.fill();
    }
    c.restore();
  }

  const ey = y + s * 0.38, er = s * 0.13;
  [0.32, 0.68].forEach((f, idx) => {
    const ex = x + s * f;
    if (k.e === 'h' || (k.e === 'w' && idx === 1)) eyeHappy(c, ex, ey, er, s);
    else if (k.e === 'z') {
      c.strokeStyle = '#111'; c.lineWidth = s * 0.06; c.lineCap = 'round';
      c.beginPath(); c.moveTo(ex - er, ey + er * 0.3); c.lineTo(ex + er, ey + er * 0.3); c.stroke();
    } else if (k.e !== 'c') eyeNormal(c, ex, ey, er, d);
    if (k.e === 'a') {
      c.strokeStyle = '#111'; c.lineWidth = s * 0.06; c.lineCap = 'round'; c.beginPath();
      const sg = idx ? -1 : 1;
      c.moveTo(ex - sg * er * 1.3, ey - er * 1.9); c.lineTo(ex + sg * er * 1.2, ey - er * 1.1); c.stroke();
    }
  });
  if (k.e === 'c') {                                    // güneş gözlüğü
    c.fillStyle = '#111'; rr(x + s * 0.18, ey - er * 0.9, s * 0.64, er * 1.7, er * 0.5, c);
    c.fillStyle = '#ffffff55'; c.fillRect(x + s * 0.26, ey - er * 0.5, s * 0.1, er * 0.5);
  }

  const y0 = y + s * 0.1, P = (a, b) => [x + s * a, y0 + s * b];   // şapkalar
  if (k.h === 'crown') {
    poly(c, [P(.2, .02), P(.2, -.22), P(.35, -.08), P(.5, -.26), P(.65, -.08), P(.8, -.22), P(.8, .02)], '#ffd93d');
  } else if (k.h === 'party') {
    poly(c, [P(.3, .02), P(.7, .02), P(.5, -.38)], '#ff6bd6'); circ(c, ...P(.5, -.38), s * .06, '#ffe66d');
  } else if (k.h === 'cap') {
    c.fillStyle = '#3b6cf0'; c.beginPath(); c.arc(...P(.5, .04), s * .3, Math.PI, 2 * Math.PI); c.fill();
    c.fillRect(...P(.5, -.02), s * .38, s * .07);
  } else if (k.h === 'horns') {
    poly(c, [P(.2, .08), P(.32, .08), P(.17, -.22)], '#e63946');
    poly(c, [P(.68, .08), P(.8, .08), P(.83, -.22)], '#e63946');
  } else if (k.h === 'halo') {
    c.strokeStyle = '#ffe66d'; c.lineWidth = s * 0.06;
    c.beginPath(); c.ellipse(...P(.5, -.12), s * .25, s * .07, 0, 0, 7); c.stroke();
  } else if (k.h === 'wizard') {
    poly(c, [P(.22, .04), P(.78, .04), P(.5, -.5)], '#5b3fd1');
    c.fillStyle = '#4a32b0'; rr(...P(.14, -.02), s * .72, s * .08, s * .04, c);
    circ(c, ...P(.5, -.2), s * .045, '#ffe66d');
  } else if (k.h === 'ears') {
    poly(c, [P(.18, .08), P(.18, -.2), P(.4, 0)], k.c); poly(c, [P(.6, 0), P(.82, -.2), P(.82, .08)], k.c);
    poly(c, [P(.22, .02), P(.22, -.12), P(.34, 0)], '#ffb3c6'); poly(c, [P(.66, 0), P(.78, -.12), P(.78, .02)], '#ffb3c6');
  } else if (k.h === 'antenna') {
    c.strokeStyle = '#ccc'; c.lineWidth = s * 0.05; c.lineCap = 'round';
    c.beginPath(); c.moveTo(...P(.5, .02)); c.lineTo(...P(.5, -.28)); c.stroke();
    circ(c, ...P(.5, -.32), s * .08, '#ff4d6d');
  } else if (k.h === 'cowboy') {
    c.fillStyle = '#8b5a2b'; c.beginPath(); c.ellipse(...P(.5, .03), s * .44, s * .08, 0, 0, 7); c.fill();
    c.fillStyle = '#a0692f'; rr(...P(.3, -.2), s * .4, s * .22, s * .06, c);
  }
}

/* ============ 3E. SKIN MENÜSÜ ============ */
let tmp = null;
function renderSkin() {
  const grp = (list, key) => list.map(o => `<button class="opt ${tmp[key] === o[0] ? 'on' : ''}" data-${key}="${o[0]}">${o[1]}</button>`).join('');
  $('swatches').innerHTML = PAL.map(c => `<button class="sw ${tmp.c === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('');
  $('hats').innerHTML = grp(HATS, 'h');
  $('eyes').innerHTML = grp(EYES, 'e');
  $('pats').innerHTML = grp(PATS, 'p');
  $('tiles').innerHTML = grp(TILES, 't');
  const pc = $('skinPrev').getContext('2d');
  pc.clearRect(0, 0, 140, 140);
  drawChar(pc, 25, 35, 90, tmp, [0, 0]);
}
$('skinBtn').onclick = () => { tmp = { ...skin }; renderSkin(); $('skinModal').classList.remove('hide'); };
$('skinModal').onclick = e => {
  if (e.target.id === 'skinModal') { $('skinModal').classList.add('hide'); return; }
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'skinSave') {
    skin = cleanSkin(tmp); skins = [skin, DEF2];
    try { localStorage.setItem('renkio-skin', JSON.stringify(skin)); } catch (er) {}
    $('skinModal').classList.add('hide'); toast('Skin kaydedildi'); return;
  }
  ['c', 'h', 'e', 'p', 't'].forEach(k => { if (b.dataset[k]) tmp[k] = b.dataset[k]; });
  renderSkin();
};

/* ============ 4. ANA MENÜ ============ */
function validate() {
  const hasName = $('name').value.trim().length > 0;
  $('count').textContent = $('name').value.length + '/10';
  $('create').disabled = !hasName;
  $('join').disabled = !(hasName && $('code').value.trim().length === 4);
}
$('name').oninput = validate;
$('code').oninput = () => { $('code').value = $('code').value.toUpperCase(); validate(); };
$('create').onclick = createRoom;
$('join').onclick = joinRoom;

function backToMenu(msg) {
  const c = conn, p = peer;
  conn = peer = null; sim = snap = null; isHost = false; ready = false; wins = [0, 0];
  names = ['', '']; lastOv = ''; stack = []; skins = [skin, DEF2];
  try { c && c.close(); } catch (e) {}
  try { p && p.destroy(); } catch (e) {}
  show('menu'); validate();
  if (typeof msg === 'string') toast(msg);
}

/* ============ 5. AĞ (PeerJS) ============ */
function createRoom() {
  setErr('');
  const code = genCode();
  names = [$('name').value.trim(), '']; ready = false; wins = [0, 0]; skins = [skin, DEF2];
  peer = new Peer(PREFIX + code, PEER_OPTS);
  peer.on('open', () => {
    isHost = true;
    $('roomCode').textContent = code;
    $('msgs').innerHTML = '';
    addMsg('', 'Oda kuruldu. Kodu arkadaşına gönder.', true);
    show('room'); renderRoom();
  });
  peer.on('connection', c => {
    if (conn) {
      c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); });
      return;
    }
    conn = c; bind(c);
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); createRoom(); }
    else { backToMenu(); setErr('Bağlantı hatası, tekrar dene.'); }
  });
}

function joinRoom() {
  setErr('');
  const code = $('code').value.trim().toUpperCase();
  names = ['', $('name').value.trim()]; ready = false; skins = [DEF2, skin];
  $('join').disabled = true;
  peer = new Peer(undefined, PEER_OPTS);
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { reliable: true });
    bind(conn);
    conn.on('open', () => {
      $('roomCode').textContent = code;
      $('msgs').innerHTML = '';
      conn.send({ t: 'hello', name: names[1], skin });
    });
    setTimeout(() => {
      if (conn && !conn.open && screen === 'menu') {
        backToMenu(); setErr('Bağlantı kurulamadı. Tekrar dene ya da başka ağdan dene.');
      }
    }, 15000);
  });
  peer.on('error', e => {
    const m = e.type === 'peer-unavailable' ? 'Oda bulunamadı.' : 'Bağlantı hatası.';
    backToMenu(); setErr(m);
  });
}

function bind(c) {
  c.on('data', onData);
  c.on('close', () => onClose(c));
}

function onClose(c) {
  if (c !== conn) return;
  if (!isHost) { backToMenu('Host odadan ayrıldı'); return; }
  const left = names[1];
  conn = null; names[1] = ''; ready = false; sim = snap = null; lastOv = ''; skins[1] = DEF2; wins = [0, 0];
  show('room');
  addMsg('', left + ' odadan ayrıldı', true);
  renderRoom();
}

function onData(m) {
  if (isHost) {
    if (m.t === 'hello') {
      names[1] = String(m.name).slice(0, 10); ready = false; wins = [0, 0];
      const s = cleanSkin(m.skin);
      if (s.c === skins[0].c) s.c = PAL.find(c => c !== skins[0].c);
      skins[1] = s;
      addMsg('', names[1] + ' odaya katıldı', true);
      send({ t: 'chat', sys: true, text: 'Odaya katıldın' });
      SFX.msg();
      syncRoom();
    }
    else if (m.t === 'ready') { ready = !!m.v; syncRoom(); }
    else if (m.t === 'chat') {
      const text = String(m.text).slice(0, 120);
      addMsg(names[1], text); send({ t: 'chat', from: names[1], text });
    }
    else if (m.t === 'dir' && sim) {
      sim.pl[1].dir = m.d;
      if (m.tap && m.d) sim.pl[1].next = m.d;
    }
    else if (m.t === 'dash' && sim && sim.phase === 'play') sim.pl[1].dashReq = true;
  } else {
    if (m.t === 'room') {
      names = m.names; ready = m.ready; secs = m.secs; skins = m.skins; mapI = m.map;
      if (screen !== 'room') { sim = snap = null; show('room'); }
      renderRoom();
    }
    else if (m.t === 'chat') addMsg(m.from, m.text, m.sys);
    else if (m.t === 'start') { names = m.names; skins = m.skins; mapI = m.map; snap = null; lastOv = ''; enterGame(); }
    else if (m.t === 's' && screen === 'game') snap = m;
    else if (m.t === 'kick') backToMenu('Odadan atıldın');
    else if (m.t === 'full') { backToMenu(); setErr('Oda dolu.'); }
  }
}

/* ============ 6. ODA EKRANI ============ */
function syncRoom() {
  renderRoom();
  send({ t: 'room', names, ready, secs, skins, map: mapI });
}

function renderRoom() {
  applyColors();
  $('players').innerHTML = [0, 1].map(i => {
    if (!names[i]) return '<div class="slot empty"><i class="dot"></i><span>Oyuncu bekleniyor...</span></div>';
    const tag = i === 0 ? '<em>HOST</em>' : `<em class="${ready ? 'ok' : ''}">${ready ? 'HAZIR' : 'BEKLİYOR'}</em>`;
    const kick = isHost && i === 1 ? '<button class="kick" id="kick">At</button>' : '';
    return `<div class="slot"><i class="dot" style="background:${skins[i].c}"></i><span>${esc(names[i])}</span>${tag}${kick}</div>`;
  }).join('');
  if ($('kick')) $('kick').onclick = kickPlayer;

  document.querySelectorAll('#dur .opt').forEach(b => {
    b.classList.toggle('on', +b.dataset.v === secs);
    b.disabled = !isHost;
    b.onclick = () => { secs = +b.dataset.v; syncRoom(); };
  });
  document.querySelectorAll('#maps .opt').forEach(b => {
    b.classList.toggle('on', +b.dataset.v === mapI);
    b.disabled = !isHost;
    b.onclick = () => { mapI = +b.dataset.v; syncRoom(); };
  });

  const a = $('action');
  if (isHost) { a.textContent = 'Oyunu Başlat'; a.disabled = !(names[1] && ready); }
  else { a.textContent = ready ? 'Hazırım' : 'Hazır Ol'; a.disabled = false; }
}

$('action').onclick = () => {
  if (isHost) startGame();
  else { ready = !ready; send({ t: 'ready', v: ready }); renderRoom(); }
};
$('leave').onclick = () => backToMenu();
$('copy').onclick = () => {
  navigator.clipboard && navigator.clipboard.writeText($('roomCode').textContent);
  toast('Kod kopyalandı');
};

function kickPlayer() {
  const c = conn, who = names[1];
  c.send({ t: 'kick' });
  conn = null; names[1] = ''; ready = false; skins[1] = DEF2; wins = [0, 0];
  addMsg('', who + ' odadan atıldı', true);
  renderRoom();
  setTimeout(() => c.close(), 300);
}

function backToRoom() {
  sim = snap = null; ready = false; lastOv = '';
  show('room'); syncRoom();
}

/* ============ 7. SOHBET (oda + oyun içi) ============ */
function gLog(from, text, sys) {
  const d = document.createElement('div');
  d.className = 'gm' + (sys ? ' sys' : '');
  d.textContent = (sys ? '' : from + ': ') + text;
  $('glog').append(d);
  while ($('glog').children.length > 6) $('glog').firstChild.remove();
  setTimeout(() => d.remove(), 9000);
}

function addMsg(from, text, sys) {
  const d = document.createElement('div');
  d.className = 'msg' + (sys ? ' sys' : '');
  if (!sys) { const b = document.createElement('b'); b.textContent = from + ': '; d.append(b); }
  d.append(text);
  $('msgs').append(d);
  $('msgs').scrollTop = 1e9;
  if (screen === 'game') gLog(from, text, sys);
  const myName = isHost ? names[0] : names[1];
  if (!sys && from !== myName) SFX.msg();
}

function sendChat(text) {
  text = text.trim();
  if (!text || !conn) return;
  if (isHost) { addMsg(names[0], text); send({ t: 'chat', from: names[0], text }); }
  else send({ t: 'chat', text });
}
$('chatForm').onsubmit = e => { e.preventDefault(); sendChat($('chatIn').value); $('chatIn').value = ''; };

const gin = $('gin');
function openChat() { gin.classList.remove('hide'); gin.focus(); stack = []; pushDir(); }
function closeChat() { gin.classList.add('hide'); gin.value = ''; gin.blur(); }

/* ============ 8. OYUN SİMÜLASYONU (sadece host) ============ */
function startGame() {
  const now = performance.now();
  const grid = [];
  MAPS[mapI].forEach(row => [...row].forEach(ch => grid.push(ch === '#' ? 3 : 0)));
  grid[1 * COLS + 1] = 1;
  grid[(ROWS - 2) * COLS + COLS - 2] = 2;
  const mk = (x, y, last) => ({ x, y, dir: null, next: null, last, dashReq: false, nextDash: 0, dashN: 0, acc: 0, fz: 0, sp: 0 });
  sim = {
    grid, phase: 'count', startAt: now + COUNTDOWN * 1000, endAt: 0, last: now, tick: 0,
    pl: [mk(1, 1, [1, 0]), mk(COLS - 2, ROWS - 2, [-1, 0])],
    pu: [], nextPu: 0, ev: { n: 0, k: 'b', w: 0 }
  };
  snap = null; lastOv = '';
  send({ t: 'start', names, skins, map: mapI });
  enterGame();
}

function tryStep(i, d, now) {
  const p = sim.pl[i], o = sim.pl[1 - i], nx = p.x + d[0], ny = p.y + d[1];
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return false;
  if (sim.grid[ny * COLS + nx] === 3 || (nx === o.x && ny === o.y)) return false;
  p.x = nx; p.y = ny; p.last = d; sim.grid[ny * COLS + nx] = i + 1;
  pickup(i, now);
  return true;
}

function pickup(i, now) {
  const p = sim.pl[i], o = sim.pl[1 - i], idx = sim.pu.findIndex(q => q.x === p.x && q.y === p.y);
  if (idx < 0) return;
  const k = sim.pu.splice(idx, 1)[0].k;
  if (k === 'b') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = p.x + dx, y = p.y + dy;
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS && sim.grid[y * COLS + x] !== 3) sim.grid[y * COLS + x] = i + 1;
    }
  }
  if (k === 'i') o.fz = now + 2000;
  if (k === 's') p.sp = now + 5000;
  sim.ev = { n: sim.ev.n + 1, k, w: i };
}

function spawnPu() {
  if (sim.pu.length >= 3) return;
  for (let t = 0; t < 40; t++) {
    const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * ROWS);
    if (sim.grid[y * COLS + x] === 3) continue;
    if (sim.pl.some(p => p.x === x && p.y === y) || sim.pu.some(q => q.x === x && q.y === y)) continue;
    sim.pu.push({ x, y, k: 'bis'[Math.floor(Math.random() * 3)] });
    return;
  }
}

function doDash(i, now) {
  const p = sim.pl[i];
  if (now < p.nextDash || p.fz > now) return;
  const d = p.next || p.dir || p.last;
  let moved = 0;
  for (let k = 0; k < DASH_LEN; k++) { if (!tryStep(i, d, now)) break; moved++; }
  if (moved) { p.nextDash = now + DASH_CD; p.dashN++; }
}

function endMatch() {                                   // seri skorunu güncelle
  let a = 0, b = 0;
  sim.grid.forEach(v => { if (v === 1) a++; else if (v === 2) b++; });
  if (a > b) wins[0]++; else if (b > a) wins[1]++;
}

function stepSim(now) {
  if (sim.phase === 'count') {
    if (now >= sim.startAt) { sim.phase = 'play'; sim.last = now; sim.endAt = now + secs * 1000; sim.nextPu = now + 4000; }
  } else if (sim.phase === 'play') {
    const dt = now - sim.last; sim.last = now;
    sim.pl.forEach((p, i) => { if (p.dashReq) { p.dashReq = false; doDash(i, now); } });
    sim.tick++;
    (sim.tick % 2 ? [0, 1] : [1, 0]).forEach(i => {
      const p = sim.pl[i];
      if (p.fz > now) { p.acc = 0; p.next = null; return; }
      p.acc += dt;
      const iv = p.sp > now ? 65 : STEP;
      while (p.acc >= iv) {
        p.acc -= iv;
        const d = p.next || p.dir; p.next = null;
        if (d) tryStep(i, d, now);
      }
    });
    if (now >= sim.nextPu) { spawnPu(); sim.nextPu = now + 6000; }
    if (now >= sim.endAt) { sim.phase = 'over'; endMatch(); }
  }
  return {
    t: 's', g: sim.grid.join(''), p: sim.pl.map(p => [p.x, p.y]), ph: sim.phase,
    time: sim.phase === 'count' ? secs : Math.max(0, Math.ceil((sim.endAt - now) / 1000)),
    cd: Math.max(1, Math.ceil((sim.startAt - now) / 1000)),
    dcd: sim.pl.map(p => Math.max(0, p.nextDash - now)),
    dn: sim.pl.map(p => p.dashN),
    pu: sim.pu.map(q => [q.x, q.y, q.k]),
    fz: sim.pl.map(p => p.fz > now), sp: sim.pl.map(p => p.sp > now),
    ev: sim.ev, w: wins
  };
}

const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),30)'])));
ticker.onmessage = () => {
  if (!isHost || !sim) return;
  const now = performance.now();
  snap = stepSim(now);
  if (now - sendT > 45) { send(snap); sendT = now; }
};

/* ============ 9. OYUN EKRANI & ÇİZİM ============ */
let sfxPrev = null, sfxPos = null, sfxPh = '', sfxCd = 0, sfxSec = -1, sfxDn = [0, 0], sfxDcd = 0, sfxEv = 0;

function enterGame() {
  stack = [];
  sfxPrev = sfxPos = null; sfxPh = ''; sfxCd = 0; sfxSec = -1; sfxDn = [0, 0]; sfxDcd = 0; sfxEv = 0;
  if (document.activeElement) document.activeElement.blur();
  show('game'); applyColors(); closeChat(); $('glog').innerHTML = '';
  $('n0').textContent = names[0]; $('n1').textContent = names[1];
  $('ov').classList.add('hide');
  dp[0] = [1, 1]; dp[1] = [COLS - 2, ROWS - 2];
  if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
}

function resize() {
  cell = Math.max(16, Math.floor(Math.min((innerWidth - 32) / COLS, (innerHeight - 200) / ROWS, 56)));
  cv.width = COLS * cell; cv.height = ROWS * cell;
  ['.hud', '.bar', '#dash'].forEach(q => document.querySelector(q).style.maxWidth = cv.width + 'px');
}
addEventListener('resize', () => screen === 'game' && resize());

function loop() {
  if (!peer) { loopOn = false; return; }
  requestAnimationFrame(loop);
  if (screen === 'game' && snap) { updateHUD(); gameSfx(); draw(); updateOverlay(); }
}

function gameSfx() {
  if (snap === sfxPrev) return;
  const me = isHost ? 0 : 1, pos = snap.p[me];
  if (snap.ph === 'count' && snap.cd !== sfxCd) { SFX.count(); sfxCd = snap.cd; }
  if (snap.ph !== sfxPh) {
    if (snap.ph === 'play') SFX.go();
    if (snap.ph === 'over') {
      const mine = snap.sc[me], other = snap.sc[1 - me];
      if (mine > other) SFX.win(); else if (mine < other) SFX.lose(); else SFX.draw();
    }
    sfxPh = snap.ph;
  }
  if (snap.ph === 'play') {
    const moved = sfxPrev && sfxPos && (pos[0] !== sfxPos[0] || pos[1] !== sfxPos[1]);
    if (snap.dn[me] !== sfxDn[me]) SFX.dash(0.1);
    else if (snap.dn[1 - me] !== sfxDn[1 - me]) SFX.dash(0.04);
    else if (moved) {
      const before = sfxPrev.g[pos[1] * COLS + pos[0]];
      if (before === '0') SFX.paint();
      else if (before !== String(me + 1)) SFX.steal();
    }
    if (snap.ev.n !== sfxEv) ({ b: SFX.bomb, i: SFX.freeze, s: SFX.speed })[snap.ev.k]();
    if (sfxDcd > 0 && snap.dcd[me] <= 0) SFX.dashReady();
    if (snap.time <= 5 && snap.time > 0 && snap.time !== sfxSec) SFX.tick();
  }
  sfxEv = snap.ev.n;
  sfxDn = snap.dn.slice(); sfxDcd = snap.dcd[me];
  sfxSec = snap.time; sfxPos = pos.slice(); sfxPrev = snap;
}

function updateHUD() {
  let a = 0, b = 0;
  for (const ch of snap.g) { if (ch === '1') a++; else if (ch === '2') b++; }
  snap.sc = [a, b];
  $('s0').textContent = a; $('s1').textContent = b;
  $('bar').style.width = (a + b ? a / (a + b) * 100 : 50) + '%';
  $('time').textContent = snap.time;
  const rem = snap.dcd[isHost ? 0 : 1];
  $('dash').classList.toggle('rdy', rem <= 0);
  $('dashFill').style.width = (100 - rem / DASH_CD * 100) + '%';
  $('dashTxt').textContent = rem > 0 ? Math.ceil(rem / 1000) + ' sn' : 'HAZIR | SPACE';
}

function updateOverlay() {
  const ov = $('ov'), key = snap.ph + (snap.ph === 'count' ? snap.cd : '');
  if (key === lastOv) return;
  lastOv = key;
  if (snap.ph === 'play') { ov.classList.add('hide'); return; }
  ov.classList.remove('hide');
  if (snap.ph === 'count') {
    ov.innerHTML = `<h2>${snap.cd}</h2><p class="mut">Hazır ol!</p>`;
    return;
  }
  const [a, b] = snap.sc;
  const w = a > b ? 0 : 1;
  const winner = a === b ? 'Berabere!' : `<span style="color:${skins[w].c}">${esc(names[w])} kazandı!</span>`;
  ov.innerHTML = `<h2 style="font-size:38px">${winner}</h2><p class="mut">${a} – ${b}</p>` +
    `<p class="mut">Seri: ${esc(names[0])} ${snap.w[0]} – ${snap.w[1]} ${esc(names[1])}</p>` + (isHost
    ? '<button class="primary" id="again">Tekrar Oyna</button><button id="toRoom">Odaya Dön</button>'
    : '<p class="mut">Host\'un seçmesi bekleniyor...</p><button class="ghost" id="exit">Odadan Çık</button>');
  if (isHost) { $('again').onclick = startGame; $('toRoom').onclick = backToRoom; }
  else $('exit').onclick = () => backToMenu();
}

function draw() {
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cv.width, cv.height);
  const g = Math.max(1.5, cell * 0.06), now = performance.now();

  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const v = snap.g[y * COLS + x], px = x * cell + g, py = y * cell + g, sz = cell - g * 2;
    if (v === '3') {                                    // duvar
      ctx.fillStyle = '#3a3f55'; rr(px, py, sz, sz, cell * 0.14);
      ctx.fillStyle = '#4a5070'; rr(px + sz * 0.12, py + sz * 0.12, sz * 0.76, sz * 0.76, cell * 0.1);
    } else {
      const k = v === '1' ? skins[0] : v === '2' ? skins[1] : null;
      ctx.fillStyle = k ? k.c : EMPTY; rr(px, py, sz, sz, cell * 0.18);
      if (k && k.t === 'i') { ctx.fillStyle = '#ffffff30'; rr(px + sz * 0.22, py + sz * 0.22, sz * 0.56, sz * 0.56, cell * 0.1); }
      if (k && k.t === 'd') circ(ctx, px + sz / 2, py + sz / 2, sz * 0.15, '#ffffff45');
    }
  }

  snap.pu.forEach(([x, y, k]) => {                      // güç topları
    const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell, pulse = 1 + Math.sin(now / 200) * 0.08;
    ctx.save(); ctx.shadowColor = PU_COL[k]; ctx.shadowBlur = cell * 0.5;
    circ(ctx, cx, cy, cell * 0.4 * pulse, PU_COL[k] + '44');
    ctx.restore();
    icon(ctx, k, cx, cy, cell * 0.28);
  });

  snap.p.forEach((pos, i) => {
    dp[i][0] += (pos[0] - dp[i][0]) * 0.35;
    dp[i][1] += (pos[1] - dp[i][1]) * 0.35;
    const s = cell * 0.78;
    const x = dp[i][0] * cell + (cell - s) / 2, y = dp[i][1] * cell + (cell - s) / 2;
    const d = ((i === 0) === isHost ? myDir() : null) || [0, 0];
    drawChar(ctx, x, y, s, skins[i], d);
    if (snap.fz[i]) {                                   // donmuş
      ctx.fillStyle = 'rgba(122,215,255,.55)'; rr(x, y, s, s, s * 0.3);
      icon(ctx, 'i', x + s / 2, y + s / 2, cell * 0.26);
    }
    if (snap.sp[i]) icon(ctx, 's', x + s * 0.95, y + s * 0.05, cell * 0.16);   // hızlı
  });
}

/* ============ 10. KLAVYE ============ */
function myDir() { return stack.length ? KEYS[stack[stack.length - 1]] : null; }

function pushDir(tap) {
  const d = myDir();
  if (isHost) {
    if (sim) { sim.pl[0].dir = d; if (tap && d) sim.pl[0].next = d; }
  } else send({ t: 'dir', d, tap: !!tap });
}

function requestDash() {
  if (isHost) { if (sim && sim.phase === 'play') sim.pl[0].dashReq = true; }
  else send({ t: 'dash' });
}

addEventListener('keydown', e => {
  if (screen !== 'game') return;
  if (document.activeElement === gin) {
    if (e.code === 'Enter') { sendChat(gin.value); closeChat(); }
    else if (e.code === 'Escape') closeChat();
    return;
  }
  if (e.code === 'Enter') { e.preventDefault(); openChat(); return; }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) requestDash(); return; }
  if (!KEYS[e.code]) return;
  e.preventDefault();
  if (e.repeat) return;
  stack = stack.filter(k => k !== e.code); stack.push(e.code); pushDir(true);
});
addEventListener('keyup', e => {
  if (screen === 'game' && e.code === 'Space') { e.preventDefault(); return; }
  if (!KEYS[e.code]) return;
  stack = stack.filter(k => k !== e.code); pushDir();
});
addEventListener('blur', () => { stack = []; pushDir(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stack = []; pushDir(); } });
