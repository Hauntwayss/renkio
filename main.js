/* ============ 1. SABİTLER ============ */
const COLS = 16, ROWS = 12, STEP = 110, COUNTDOWN = 3;
const COLORS = ['#ff4d6d', '#3ddcff'], EMPTY = '#232323';
const PREFIX = 'renkio-', CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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

/* ============ 2. DURUM ============ */
let peer = null, conn = null, isHost = false, screen = 'menu';
let names = ['', ''], ready = false, secs = 60;        // oda bilgisi
let sim = null, snap = null, loopOn = false;           // oyun bilgisi
let cell = 32, sendT = 0, lastOv = '', stack = [];
const dp = [[0, 0], [0, 0]];                           // çizim için yumuşatılmış konumlar

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
  conn = peer = null; sim = snap = null; isHost = false; ready = false;
  names = ['', '']; lastOv = ''; stack = [];
  try { c && c.close(); } catch (e) {}
  try { p && p.destroy(); } catch (e) {}
  show('menu'); validate();
  if (typeof msg === 'string') toast(msg);
}

/* ============ 5. AĞ (PeerJS) ============ */
function createRoom() {
  setErr('');
  const code = genCode();
  names = [$('name').value.trim(), '']; ready = false;
  peer = new Peer(PREFIX + code, PEER_OPTS);
  peer.on('open', () => {
    isHost = true;
    $('roomCode').textContent = code;
    $('msgs').innerHTML = '';
    addMsg('', 'Oda kuruldu. Kodu arkadaşına gönder.', true);
    show('room'); renderRoom();
  });
  peer.on('connection', c => {
    if (conn) {                                   // oda dolu
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
  names = ['', $('name').value.trim()]; ready = false;
  $('join').disabled = true;
  peer = new Peer(undefined, PEER_OPTS);
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { reliable: true });
    bind(conn);
    conn.on('open', () => {
      $('roomCode').textContent = code;
      $('msgs').innerHTML = '';
      conn.send({ t: 'hello', name: names[1] });
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
  conn = null; names[1] = ''; ready = false; sim = snap = null; lastOv = '';
  show('room');
  addMsg('', left + ' odadan ayrıldı', true);
  renderRoom();
}

function onData(m) {
  if (isHost) {
    if (m.t === 'hello') {
      names[1] = String(m.name).slice(0, 10); ready = false;
      addMsg('', names[1] + ' odaya katıldı', true);
      send({ t: 'chat', sys: true, text: 'Odaya katıldın' });
      syncRoom();
    }
    else if (m.t === 'ready') { ready = !!m.v; syncRoom(); }
    else if (m.t === 'chat') {
      const text = String(m.text).slice(0, 120);
      addMsg(names[1], text); send({ t: 'chat', from: names[1], text });
    }
    else if (m.t === 'dir' && sim) {
      sim.pl[1].dir = m.d;
      if (m.tap && m.d) sim.pl[1].next = m.d;     // kısa basışı kaybetme
    }
  } else {
    if (m.t === 'room') {
      names = m.names; ready = m.ready; secs = m.secs;
      if (screen !== 'room') { sim = snap = null; show('room'); }
      renderRoom();
    }
    else if (m.t === 'chat') addMsg(m.from, m.text, m.sys);
    else if (m.t === 'start') { names = m.names; snap = null; lastOv = ''; enterGame(); }
    else if (m.t === 's' && screen === 'game') snap = m;
    else if (m.t === 'kick') backToMenu('Odadan atıldın');
    else if (m.t === 'full') { backToMenu(); setErr('Oda dolu.'); }
  }
}

/* ============ 6. ODA EKRANI ============ */
function syncRoom() {
  renderRoom();
  send({ t: 'room', names, ready, secs });
}

function renderRoom() {
  $('players').innerHTML = [0, 1].map(i => {
    if (!names[i]) return '<div class="slot empty"><i class="dot"></i><span>Oyuncu bekleniyor...</span></div>';
    const tag = i === 0 ? '<em>HOST</em>' : `<em class="${ready ? 'ok' : ''}">${ready ? 'HAZIR' : 'BEKLİYOR'}</em>`;
    const kick = isHost && i === 1 ? '<button class="kick" id="kick">At</button>' : '';
    return `<div class="slot"><i class="dot c${i}"></i><span>${esc(names[i])}</span>${tag}${kick}</div>`;
  }).join('');
  if ($('kick')) $('kick').onclick = kickPlayer;

  document.querySelectorAll('#dur .opt').forEach(b => {
    b.classList.toggle('on', +b.dataset.v === secs);
    b.disabled = !isHost;
    b.onclick = () => { secs = +b.dataset.v; syncRoom(); };
  });

  const a = $('action');
  if (isHost) { a.textContent = 'Oyunu Başlat'; a.disabled = !(names[1] && ready); }
  else { a.textContent = ready ? 'Hazırım ✓' : 'Hazır Ol'; a.disabled = false; }
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
  conn = null; names[1] = ''; ready = false;
  addMsg('', who + ' odadan atıldı', true);
  renderRoom();
  setTimeout(() => c.close(), 300);
}

function backToRoom() {
  sim = snap = null; ready = false; lastOv = '';
  show('room'); syncRoom();
}

/* ============ 7. SOHBET ============ */
function addMsg(from, text, sys) {
  const d = document.createElement('div');
  d.className = 'msg' + (sys ? ' sys' : '');
  if (!sys) { const b = document.createElement('b'); b.textContent = from + ': '; d.append(b); }
  d.append(text);
  $('msgs').append(d);
  $('msgs').scrollTop = 1e9;
}

$('chatForm').onsubmit = e => {
  e.preventDefault();
  const text = $('chatIn').value.trim();
  $('chatIn').value = '';
  if (!text || !conn) return;
  if (isHost) { addMsg(names[0], text); send({ t: 'chat', from: names[0], text }); }
  else send({ t: 'chat', text });
};

/* ============ 8. OYUN SİMÜLASYONU (sadece host çalıştırır) ============ */
function startGame() {
  const now = performance.now();
  const grid = Array(COLS * ROWS).fill(0);
  grid[1 * COLS + 1] = 1;
  grid[(ROWS - 2) * COLS + COLS - 2] = 2;
  sim = {
    grid, phase: 'count', startAt: now + COUNTDOWN * 1000, endAt: 0, acc: 0, last: now, step: 0,
    pl: [{ x: 1, y: 1, dir: null, next: null }, { x: COLS - 2, y: ROWS - 2, dir: null, next: null }]
  };
  snap = null; lastOv = '';
  send({ t: 'start', names });
  enterGame();
}

function stepSim(now) {
  if (sim.phase === 'count') {
    if (now >= sim.startAt) { sim.phase = 'play'; sim.last = now; sim.endAt = now + secs * 1000; }
  } else if (sim.phase === 'play') {
    sim.acc += now - sim.last; sim.last = now;
    while (sim.acc >= STEP) {
      sim.acc -= STEP; sim.step++;
      const order = sim.step % 2 ? [0, 1] : [1, 0];   // öncelik sırayla değişir (adil olsun)
      order.forEach(i => {
        const p = sim.pl[i], o = sim.pl[1 - i];
        const d = p.next || p.dir;                    // kısa basış varsa önce o uygulanır
        p.next = null;
        if (!d) return;
        const nx = p.x + d[0], ny = p.y + d[1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
        if (nx === o.x && ny === o.y) return;
        p.x = nx; p.y = ny; sim.grid[ny * COLS + nx] = i + 1;
      });
    }
    if (now >= sim.endAt) sim.phase = 'over';
  }
  return {
    t: 's', g: sim.grid.join(''), p: sim.pl.map(p => [p.x, p.y]), ph: sim.phase,
    time: sim.phase === 'count' ? secs : Math.max(0, Math.ceil((sim.endAt - now) / 1000)),
    cd: Math.max(1, Math.ceil((sim.startAt - now) / 1000))
  };
}

/* Host zamanlayıcısı: sekme arkada olsa da oyun donmasın */
const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),30)'])));
ticker.onmessage = () => {
  if (!isHost || !sim) return;
  const now = performance.now();
  snap = stepSim(now);
  if (now - sendT > 45) { send(snap); sendT = now; }
};

/* ============ 9. OYUN EKRANI & ÇİZİM ============ */
function enterGame() {
  stack = [];
  show('game');
  $('n0').textContent = names[0]; $('n1').textContent = names[1];
  $('ov').classList.add('hide');
  dp[0] = [1, 1]; dp[1] = [COLS - 2, ROWS - 2];
  if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
}

function resize() {
  cell = Math.max(16, Math.floor(Math.min((innerWidth - 32) / COLS, (innerHeight - 170) / ROWS, 56)));
  cv.width = COLS * cell; cv.height = ROWS * cell;
  document.querySelector('.hud').style.maxWidth = cv.width + 'px';
  document.querySelector('.bar').style.maxWidth = cv.width + 'px';
}
addEventListener('resize', () => screen === 'game' && resize());

function loop() {
  if (!peer) { loopOn = false; return; }
  requestAnimationFrame(loop);
  if (screen === 'game' && snap) { updateHUD(); draw(); updateOverlay(); }
}

function updateHUD() {
  let a = 0, b = 0;
  for (const ch of snap.g) { if (ch === '1') a++; else if (ch === '2') b++; }
  snap.sc = [a, b];
  $('s0').textContent = a; $('s1').textContent = b;
  $('bar').style.width = (a + b ? a / (a + b) * 100 : 50) + '%';
  $('time').textContent = snap.time;
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
  const winner = a === b ? 'Berabere!'
    : `<span style="color:${COLORS[a > b ? 0 : 1]}">${esc(names[a > b ? 0 : 1])} kazandı!</span>`;
  ov.innerHTML = `<h2 style="font-size:38px">${winner}</h2><p class="mut">${a} – ${b}</p>` + (isHost
    ? '<button class="primary" id="again">Tekrar Oyna</button><button id="toRoom">Odaya Dön</button>'
    : '<p class="mut">Host\'un seçmesi bekleniyor...</p><button class="ghost" id="exit">Odadan Çık</button>');
  if (isHost) { $('again').onclick = startGame; $('toRoom').onclick = backToRoom; }
  else $('exit').onclick = () => backToMenu();
}

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

function draw() {
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cv.width, cv.height);
  const g = Math.max(1.5, cell * 0.06);

  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const v = snap.g[y * COLS + x];
    ctx.fillStyle = v === '1' ? COLORS[0] : v === '2' ? COLORS[1] : EMPTY;
    rr(x * cell + g, y * cell + g, cell - g * 2, cell - g * 2, cell * 0.18);
  }

  snap.p.forEach((pos, i) => {
    dp[i][0] += (pos[0] - dp[i][0]) * 0.35;
    dp[i][1] += (pos[1] - dp[i][1]) * 0.35;
    const s = cell * 0.78;
    const x = dp[i][0] * cell + (cell - s) / 2, y = dp[i][1] * cell + (cell - s) / 2;

    ctx.save(); ctx.shadowColor = COLORS[i]; ctx.shadowBlur = cell * 0.5;
    ctx.fillStyle = '#fff'; rr(x, y, s, s, s * 0.3); ctx.restore();
    ctx.fillStyle = COLORS[i]; rr(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.22);

    const ey = y + s * 0.38, er = s * 0.13;
    const d = ((i === 0) === isHost ? myDir() : null) || [0, 0];   // sadece kendi gözün yöne bakar
    [0.32, 0.68].forEach(f => {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + s * f, ey, er, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath();
      ctx.arc(x + s * f + d[0] * er * 0.5, ey + d[1] * er * 0.5, er * 0.5, 0, 7); ctx.fill();
    });
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

addEventListener('keydown', e => {
  if (screen !== 'game' || !KEYS[e.code]) return;
  e.preventDefault();
  if (e.repeat) return;
  stack = stack.filter(k => k !== e.code); stack.push(e.code); pushDir(true);
});
addEventListener('keyup', e => {
  if (!KEYS[e.code]) return;
  stack = stack.filter(k => k !== e.code); pushDir();
});
/* Pencere odağı gidince basılı sanılan tuşları temizle */
addEventListener('blur', () => { stack = []; pushDir(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stack = []; pushDir(); } });
