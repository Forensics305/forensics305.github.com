'use strict';
const MURDER_BUDGET  = 25;
const MIN_PLAYERS    = 3;
const MAX_SUSPECTS   = 5;

// Phase durations (seconds)
const TIMER_ROLE_REVEAL = 15;
const TIMER_MURDER_TURN = 75;
const TIMER_CRIME_SCENE = 45;
const TIMER_ALIBI       = 60;
const TIMER_DISCUSSION  = 120;
const TIMER_VOTE        = 60;
const TIMER_MURDER_FALLBACK_BUFFER = 5; // extra seconds host waits before auto-generating a murder
const REJOIN_TIMEOUT_MS = 10000; // ms to wait before giving up on a rejoin attempt

// PeerJS config with STUN + TURN servers for cross-network (different WiFi / mobile) connectivity
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:openrelay.metered.ca:80' },
      { urls: 'turn:openrelay.metered.ca:80',               username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp',username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  },
};

const METHODS = [
  { id: 'stab',     label: '🗡️ Stabbing' },
  { id: 'poison',   label: '☠️ Poisoning' },
  { id: 'strangle', label: '🤚 Strangling' },
  { id: 'blunt',    label: '🔨 Blunt Force Trauma' },
  { id: 'suffoc',   label: '🛏️ Suffocation' },
  { id: 'drown',    label: '🌊 Drowning' },
  { id: 'push',     label: '⬇️ Pushed from Height' },
  { id: 'elec',     label: '⚡ Electrocution' },
  { id: 'shoot',    label: '🔫 Shooting' },
];

const LOCATIONS = [
  'the library', 'the kitchen', 'the garden', 'the basement',
  'the study', 'the ballroom', 'the conservatory', 'the garage',
  'the master bedroom', 'the dining room', 'the attic', 'the wine cellar',
];

const SUPPLIES = [
  { id: 's1',  name: 'Rubber Gloves',     cost: 3,  desc: 'Leave no fingerprints' },
  { id: 's2',  name: 'Bleach',            cost: 5,  desc: 'Destroy DNA evidence' },
  { id: 's3',  name: 'Burner Phone',      cost: 12, desc: 'Send anonymous tips' },
  { id: 's4',  name: 'Fake ID',           cost: 10, desc: 'Frame another player' },
  { id: 's5',  name: 'Lock Picks',        cost: 8,  desc: 'Access any locked room' },
  { id: 's6',  name: 'Disguise Kit',      cost: 7,  desc: 'Change your appearance' },
  { id: 's7',  name: 'Rope',              cost: 4,  desc: 'Useful for staging' },
  { id: 's8',  name: 'Shovel',            cost: 6,  desc: 'Bury the evidence' },
  { id: 's9',  name: 'Gasoline',          cost: 5,  desc: 'Burn away trace evidence' },
  { id: 's10', name: 'Duct Tape',         cost: 3,  desc: 'Silence or restrain' },
  { id: 's11', name: 'Forged Letter',     cost: 9,  desc: 'Plant false evidence' },
  { id: 's12', name: 'Poison Vial',       cost: 11, desc: 'Extra lethal supplies' },
  { id: 's13', name: 'Chloroform Cloth',  cost: 7,  desc: 'Subdue without struggle' },
  { id: 's14', name: 'Evidence Spray',    cost: 6,  desc: 'Remove trace evidence' },
];

const DUMP_LOCATIONS = [
  'the riverbank', 'the garden shed', 'the old well', 'the east woods',
  'the storm drain', 'behind the greenhouse', 'the pond', 'the service alley',
  'beneath the floorboards', 'the quarry',
];

const FINGERPRINT_TYPES = ['Loop', 'Whorl', 'Arch', 'Radial Loop', 'Tented Arch'];
const PALM_PRINT_PATTERNS = [
  'Thenar Loop', 'Thenar Whorl', 'Hypothenar Loop',
  'Hypothenar Whorl', 'Interdigital Loop', 'Open Field',
];

const WITNESS_TIME_SLOTS = [
  '10:15 PM', '10:45 PM', '11:00 PM', '11:20 PM', '11:45 PM',
  '12:00 AM', '12:30 AM', '1:00 AM', '1:15 AM', '1:45 AM', '2:00 AM',
];

const WITNESS_QUOTES = [
  '"Nobody saw anything tonight."',
  '"Just take it and go."',
  '"This stays between us."',
  '"Hurry — we don\'t have much time."',
  '"Don\'t look back, just keep moving."',
  '"It\'s done. Let\'s get out of here."',
  '"If anyone asks, I wasn\'t here."',
  '"Keep your voice down."',
  '"We need to make this quick."',
  '"Stop panicking — no one will find out."',
  '"Nobody can know about this."',
  '"Watch your step. Don\'t leave tracks."',
];

const WITNESS_DETAILS = [
  'was wearing dark gloves',
  'kept looking over their shoulder nervously',
  'was carrying something heavy and wrapped in cloth',
  'moved with a noticeable limp',
  'wore a dark jacket with the collar turned up',
  'appeared to be in a great hurry',
  'was muttering quietly to themselves',
  'paused to check their watch twice',
  'seemed very familiar with the area',
  'had something dark stained on their sleeve',
  'was breathing heavily',
  'dropped something small but quickly picked it up',
];

let state = {
  // identity
  playerName:      '',
  playerId:        '',
  isHost:          false,
  hostPlaying:     true,    // host can choose to play or just observe

  // PeerJS
  peer:            null,
  hostConn:        null,      // player → host connection
  playerConns:     {},        // host → each player {playerId: DataConnection}

  // room / players
  roomCode:        '',
  players:         [],        // [{id, name, isAlive, isHost}]
  gameStatus:      'lobby',

  // roles
  role:            null,      // 'murderer' | 'innocent'
  murdererPlayerId: null,     // host only

  // murder planning (murderer only)
  selectedVictim:  null,
  selectedMethod:  null,
  selectedSupplies: [],
  budgetLeft:      MURDER_BUDGET,

  // round tracking
  currentRound:    0,
  murders:         [],
  hospitalRecords: [],

  // voting
  myVote:          null,
  votes:           {},        // host: {round: {voterId: suspectId}}

  // alibis
  alibis:          {},        // host: {round: {playerId: alibiText}}

  // role acknowledgement (host)
  roleAcks:        {},

  // forensic profiles: playerId → {dna, fingerprint, palmPrint}
  forensicProfiles:    {},
  pendingElimination:  null,   // {id, name} of player to eliminate at start of next round
  // per-round alibi tracking
  alibiSubmitted:  false,

  // skip-discussion votes (host only, reset each discussion)
  skipVotes:       [],
};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generatePlayerId() {
  return 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateWitnessClue(dumpLocation) {
  const time   = randomFrom(WITNESS_TIME_SLOTS);
  const detail = randomFrom(WITNESS_DETAILS);
  const quote  = randomFrom(WITNESS_QUOTES);
  const type   = Math.floor(Math.random() * 3);
  if (type === 0) {
    return `A witness spotted someone disposing of the body at ${dumpLocation} around ${time}. The witness noted the person ${detail}.`;
  } else if (type === 1) {
    return `At ${time}, a bystander near ${dumpLocation} overheard someone say: ${quote}`;
  } else {
    return `At approximately ${time}, a witness saw a figure at ${dumpLocation}. They ${detail} and were overheard saying: ${quote}`;
  }
}

/* ============================================================
   FORENSIC SCIENCE HELPERS
   ============================================================ */
function generateDNASequence() {
  const segs = [];
  for (let i = 0; i < 4; i++) {
    let s = '';
    for (let j = 0; j < 4; j++) s += 'ATGC'[Math.floor(Math.random() * 4)];
    segs.push(s);
  }
  return segs.join('-');
}

function generateForensicProfile() {
  return {
    dna:         generateDNASequence(),
    fingerprint: randomFrom(FINGERPRINT_TYPES),
    palmPrint:   randomFrom(PALM_PRINT_PATTERNS),
  };
}

/**
 * Determines what forensic evidence the murderer left at the scene,
 * taking into account cover-up supplies they purchased.
 * s1 = Rubber Gloves (no fingerprint), s2 = Bleach (destroys DNA),
 * s14 = Evidence Spray (removes palm print).
 */
function buildSceneForensics(murdererProfile, supplies) {
  const supIds       = (supplies || []).map(s => s.id);
  const hasGloves    = supIds.includes('s1');
  const hasBleach    = supIds.includes('s2');
  const hasEvidSpray = supIds.includes('s14');
  const evidence     = [];

  if (!hasBleach) {
    const parts   = murdererProfile.dna.split('-');
    const partial = parts.slice(0, 2).join('-') + '-????-????';
    evidence.push({ type: 'dna', icon: '🧬', label: 'DNA Fragment', value: partial,
      note: 'Partial STR profile recovered from scene' });
  } else {
    evidence.push({ type: 'dna', icon: '🧬', label: 'DNA Evidence', value: '— DEGRADED —',
      note: 'Biological evidence chemically destroyed' });
  }

  if (!hasGloves) {
    evidence.push({ type: 'fingerprint', icon: '👆', label: 'Fingerprint Pattern', value: murdererProfile.fingerprint,
      note: 'Latent print lifted from surface' });
  } else {
    evidence.push({ type: 'fingerprint', icon: '👆', label: 'Fingerprint', value: '— NONE —',
      note: 'Gloves prevented print transfer' });
  }

  if (!hasEvidSpray) {
    evidence.push({ type: 'palmprint', icon: '✋', label: 'Palm Print', value: murdererProfile.palmPrint,
      note: 'Partial palm impression recovered' });
  } else {
    evidence.push({ type: 'palmprint', icon: '✋', label: 'Palm Print', value: '— OBSCURED —',
      note: 'Evidence spray removed traces' });
  }

  return evidence;
}

/* ============================================================
   SESSION & PERSISTENCE HELPERS
   ============================================================ */

function savePlayerName(name) {
  try { localStorage.setItem('tl_playerName', name); } catch (e) { console.warn('Could not save player name:', e); }
}

function loadPlayerName() {
  try { return localStorage.getItem('tl_playerName') || ''; } catch (e) { console.warn('Could not load player name:', e); return ''; }
}

function saveSession(data) {
  try { sessionStorage.setItem('tl_session', JSON.stringify(data)); } catch (e) { console.warn('Could not save session:', e); }
  const hash = (data.isHost ? 'host' : 'join') + '/' + data.roomCode;
  history.replaceState(null, '', location.pathname + '#' + hash);
}

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('tl_session') || 'null'); } catch (e) { console.warn('Could not load session:', e); return null; }
}

function clearSession() {
  try { sessionStorage.removeItem('tl_session'); } catch (e) { console.warn('Could not clear session:', e); }
  history.replaceState(null, '', location.pathname);
}

/* ============================================================
   PHASE TIMER HELPERS
   ============================================================ */
// ── Phase timer helpers ───────────────────────────────────────────────────
let _phaseCountdown = null;  // display countdown interval (all clients)
let _hostPhaseTimer = null;  // host auto-advance timeout

function clearCountdown() {
  if (_phaseCountdown) { clearInterval(_phaseCountdown); _phaseCountdown = null; }
}

function clearHostTimer() {
  if (_hostPhaseTimer) { clearTimeout(_hostPhaseTimer); _hostPhaseTimer = null; }
}

function clearAllTimers() { clearCountdown(); clearHostTimer(); }

/**
 * Start a visual countdown on specific element IDs.
 * @param {string} textId     - ID of the timer label element
 * @param {string} fillId     - ID of the bar fill element
 * @param {number} duration   - total duration in seconds
 * @param {Function} [onExpire] - called when remaining reaches 0
 */
function startCountdown(textId, fillId, duration, onExpire) {
  clearCountdown();
  let remaining = duration;
  const tick = () => {
    const mins   = Math.floor(remaining / 60);
    const secs   = remaining % 60;
    const label  = `${mins}:${String(secs).padStart(2, '0')}`;
    const urgent = remaining <= 10;
    const textEl = document.getElementById(textId);
    const fillEl = document.getElementById(fillId);
    if (textEl) {
      textEl.textContent = label;
      textEl.classList.toggle('timer-urgent', urgent);
    }
    if (fillEl) {
      fillEl.style.width = `${(remaining / duration) * 100}%`;
      fillEl.classList.toggle('timer-fill-urgent', urgent);
    }
    if (remaining <= 0) { clearCountdown(); if (onExpire) onExpire(); return; }
    remaining--;
  };
  tick();
  _phaseCountdown = setInterval(tick, 1000);
}

/**
 * Start the host's authoritative phase timeout (only on the host).
 * @param {number} duration  - seconds until callback fires
 * @param {Function} callback
 */
function setHostTimer(duration, callback) {
  clearHostTimer();
  _hostPhaseTimer = setTimeout(callback, duration * 1000);
}

// Auto-commit the murder when the murderer's timer expires
function autoCommitMurder() {
  if (!state.selectedVictim) {
    const candidates = state.players.filter(p => p.isAlive && p.id !== state.playerId);
    if (candidates.length) {
      const victim = randomFrom(candidates);
      state.selectedVictim = victim.id;
      const el = Array.from(document.querySelectorAll('#victim-options .option-item'))
                      .find(e => e.dataset.id === victim.id);
      if (el) selectVictim(victim.id, el);
    }
  }
  if (!state.selectedMethod) {
    const m = randomFrom(METHODS);
    state.selectedMethod = m.id;
    const el = Array.from(document.querySelectorAll('#method-options .option-item'))
                    .find(e => e.dataset.id === m.id);
    if (el) selectMethod(m.id, el);
  }
  if (state.selectedVictim && state.selectedMethod) commitMurder();
}

// Host fallback: generate a murder automatically when the murderer hasn't acted
function autoGenerateMurder() {
  if (state.gameStatus !== 'murderer_turn') return;
  const candidates = state.players.filter(p => p.isAlive && p.id !== state.murdererPlayerId);
  if (!candidates.length) { endGame('murderer'); return; }
  const victim = randomFrom(candidates);
  const method = randomFrom(METHODS);
  processMurder({
    type:     'murder_submitted',
    victimId: victim.id,
    method:   method.id,
    supplies: [],
    round:    state.currentRound,
    playerId: state.murdererPlayerId,
  });
}

function getValidName() {
  const name = document.getElementById('input-player-name').value.trim();
  if (!name) { showError('error-profile', 'Please enter your name.'); return null; }
  if (name.length > 20) { showError('error-profile', 'Name must be 20 characters or less.'); return null; }
  return name;
}

function createRoom() {
  const name = getValidName();
  if (!name) return;
  savePlayerName(name);
  state.playerName = name;
  state.isHost     = true;
  state.playerId   = generatePlayerId();
  initHostPeer();
}

function showJoinScreen() {
  const name = getValidName();
  if (!name) return;
  savePlayerName(name);
  state.playerName = name;
  state.isHost     = false;
  state.playerId   = generatePlayerId();
  showScreen('screen-join');
}

document.getElementById('input-player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') createRoom();
});

function goBackFromHostLobby() {
  if (state.peer) { try { state.peer.destroy(); } catch (e) {} state.peer = null; }
  state.roomCode = '';
  state.players  = [];
  state.isHost   = false;
  state.playerId = '';
  clearSession();
  showScreen('screen-profile');
}

function initHostPeer() {
  const code = generateRoomCode();
  state.roomCode = code;
  showScreen('screen-host-lobby');
  document.getElementById('display-room-code').textContent = code;

  state.peer = new Peer('tl-' + code, PEER_CONFIG);

  state.peer.on('open', () => {
    state.players = [{ id: state.playerId, name: state.playerName, isAlive: true, isHost: true }];
    saveSession({ playerId: state.playerId, playerName: state.playerName, roomCode: code, isHost: true });
    renderHostLobby();
  });

  state.peer.on('connection', conn => {
    conn.on('open', () => {
      conn.on('data',  data => handleMessage(data, conn));
      conn.on('close', ()   => {
        const pid = conn.metadata && conn.metadata.playerId;
        if (pid) handlePlayerDisconnect(pid);
      });
    });
  });

  state.peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      state.peer.destroy();
      initHostPeer(); // try a new code
    } else {
      console.error('Host peer error:', err);
      alert('Connection error: ' + err.message);
    }
  });
}

function handlePlayerDisconnect(playerId) {
  if (state.gameStatus !== 'lobby') return; // mid-game: keep them in list
  state.players = state.players.filter(p => p.id !== playerId);
  delete state.playerConns[playerId];
  renderHostLobby();
  broadcastToAll({ type: 'player_list', players: publicPlayerList() });
}

function broadcastToAll(msg, excludeId) {
  Object.entries(state.playerConns).forEach(([pid, conn]) => {
    if (pid === excludeId) return;
    if (conn && conn.open) { try { conn.send(msg); } catch (e) { console.error('broadcast send error:', e); } }
  });
}

function sendToPlayer(playerId, msg) {
  const conn = state.playerConns[playerId];
  if (conn && conn.open) { try { conn.send(msg); } catch (e) { console.error('sendToPlayer error:', e); } }
}

function publicPlayerList() {
  return state.players.map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive, isHost: !!p.isHost }));
}

function kickPlayer(playerId) {
  if (state.gameStatus !== 'lobby') return;
  const conn = state.playerConns[playerId];
  if (conn) {
    try { conn.send({ type: 'kicked' }); } catch (e) { console.error('kick send error:', e); }
    setTimeout(() => { try { conn.close(); } catch (e) { console.error('kick close error:', e); } }, 400);
  }
  state.players = state.players.filter(p => p.id !== playerId);
  delete state.playerConns[playerId];
  renderHostLobby();
  broadcastToAll({ type: 'player_list', players: publicPlayerList() });
}

function copyRoomCode(btnEl) {
  const code = state.roomCode;
  const btn = btnEl || document.querySelector('#screen-host-lobby .btn-copy');
  const joinUrl = location.origin + location.pathname + '#join/' + code;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(joinUrl).then(() => {
      if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
    }).catch(() => { prompt('Copy this invite link:', joinUrl); });
  } else {
    prompt('Copy this invite link:', joinUrl);
  }
}

// Show the observer-host game board with an optional status message and phase timer.
function showHostBoard(statusMsg, timerDuration) {
  showScreen('screen-host-board');
  const boardCode = document.getElementById('board-room-code');
  if (boardCode) boardCode.textContent = state.roomCode || '------';
  const boardStatus = document.getElementById('board-status');
  if (boardStatus) boardStatus.textContent = statusMsg || 'Please wait…';
  const boardTimerBlock = document.getElementById('board-timer-block');
  if (timerDuration && boardTimerBlock) {
    boardTimerBlock.style.display = 'flex';
    startCountdown('board-timer-text', 'board-timer-fill', timerDuration, null);
  } else {
    if (boardTimerBlock) boardTimerBlock.style.display = 'none';
  }
  refreshHostBoard();
}

// Rebuild the player list and alibis panel on the host board.
function refreshHostBoard() {
  // ── Player list ──────────────────────────────────────────────────────────
  const playerList = document.getElementById('board-player-list');
  if (playerList) {
    playerList.innerHTML = '';
    state.players.forEach(p => {
      const div = document.createElement('div');
      const isObserverHost = p.isHost && !state.hostPlaying;
      const alive = isObserverHost || p.isAlive; // observer host is never "dead"
      div.className = 'board-player-item' + (alive ? '' : ' board-player-dead');
      const statusIcon = alive ? '🟢' : '💀';
      const badges = (p.isHost ? ' <span class="badge">HOST</span>' : '') +
                     (isObserverHost ? ' <span class="badge badge-observer">OBS</span>' : '');
      div.innerHTML =
        `<span class="board-player-status">${statusIcon}</span>` +
        `<span class="board-player-name">${escapeHtml(p.name)}${badges}</span>`;
      playerList.appendChild(div);
    });
  }

  // ── Alibis (all rounds, sorted by round then name) ────────────────────────
  const alibisSection = document.getElementById('board-alibis-section');
  const alibisList    = document.getElementById('board-alibis-list');
  if (alibisSection && alibisList) {
    const allAlibis = [];
    Object.entries(state.alibis).forEach(([round, roundAlibis]) => {
      Object.entries(roundAlibis).forEach(([pid, text]) => {
        const player = state.players.find(p => p.id === pid);
        allAlibis.push({
          round:      Number(round),
          playerName: player ? player.name : 'Unknown',
          alibi:      text,
        });
      });
    });

    if (allAlibis.length > 0) {
      allAlibis.sort((a, b) => a.round - b.round || a.playerName.localeCompare(b.playerName));
      alibisList.innerHTML = allAlibis.map(a => {
        const alibiContent = a.alibi
          ? `<span class="alibi-text">${escapeHtml(a.alibi)}</span>`
          : `<em class="alibi-empty alibi-text">No alibi provided.</em>`;
        return `<div class="alibi-item">
           <span class="alibi-player">${escapeHtml(a.playerName)} <span class="alibi-round-tag">Rd ${a.round}</span></span>
           ${alibiContent}
         </div>`;
      }).join('');
      alibisSection.style.display = 'block';
    } else {
      alibisSection.style.display = 'none';
    }
  }
}

function renderHostLobby() {
  document.getElementById('host-player-count').textContent = state.players.length;
  const list = document.getElementById('host-player-list');
  list.innerHTML = '';
  state.players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML =
      `<span class="player-name">${escapeHtml(p.name)}${p.isHost ? ' <span class="badge">HOST</span>' : ''}</span>` +
      (!p.isHost ? `<button class="btn btn-xs btn-danger" onclick="kickPlayer('${escapeHtml(p.id)}')">Kick</button>` : '');
    list.appendChild(div);
  });
  const gamePlayerCount = state.hostPlaying
    ? state.players.length
    : state.players.filter(p => !p.isHost).length;
  document.getElementById('btn-start').disabled = gamePlayerCount < MIN_PLAYERS;
  const hintEl = document.getElementById('hint-min-players');
  if (hintEl) {
    hintEl.textContent = state.hostPlaying
      ? 'Need at least 3 players to start'
      : 'Need at least 3 players to start (you will observe)';
  }
}

function toggleHostPlaying(checkbox) {
  state.hostPlaying = checkbox.checked;
  const hintP = document.getElementById('host-mode-hint');
  if (hintP) {
    hintP.textContent = state.hostPlaying
      ? 'You will receive a role and participate in the game.'
      : 'You will watch the game without participating.';
  }
  renderHostLobby();
}

function joinRoom() {
  const code = document.getElementById('input-room-code').value.trim().toUpperCase();
  if (!code) { showError('error-join', 'Please enter a room code.'); return; }
  state.roomCode = code;
  initPlayerPeer();
}

document.getElementById('input-room-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinRoom();
});

function initPlayerPeer() {
  state.peer = new Peer(undefined, PEER_CONFIG);
  state.peer.on('open', connectToHost);
  state.peer.on('error', err => {
    console.error('Player peer error:', err);
    showError('error-join', 'Connection error. Please try again.');
  });
}

function connectToHost() {
  const conn = state.peer.connect('tl-' + state.roomCode, { metadata: { playerId: state.playerId } });
  let opened = false;

  conn.on('open', () => {
    opened = true;
    state.hostConn = conn;
    conn.send({ type: 'player_join', playerId: state.playerId, playerName: state.playerName });
    saveSession({ playerId: state.playerId, playerName: state.playerName, roomCode: state.roomCode, isHost: false });
    showScreen('screen-player-lobby');
    document.getElementById('display-my-room-code').textContent = state.roomCode;
  });

  conn.on('data',  data => handleMessage(data, null));
  conn.on('error', err  => {
    console.error('Conn error:', err);
    showError('error-join', 'Could not connect. Check the room code and try again.');
  });
  conn.on('close', () => {
    if (state.gameStatus !== 'game_over') alert('Disconnected from host.');
  });

  setTimeout(() => {
    if (!opened) showError('error-join', 'Connection timed out. Check the room code and try again.');
  }, 12000);
}

function renderPlayerLobby() {
  const list = document.getElementById('player-lobby-list');
  if (!list) return;
  list.innerHTML = '';
  state.players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-tag';
    div.textContent = p.name + (p.isHost ? ' (Host)' : '');
    list.appendChild(div);
  });
}

function handleMessage(data, senderConn) {
  switch (data.type) {

    /* ---- host receives ---- */
    case 'player_join':
      if (!state.isHost) break;
      if (state.gameStatus !== 'lobby') {
        if (senderConn) senderConn.send({ type: 'error', message: 'Game already in progress.' });
        break;
      }
      state.playerConns[data.playerId] = senderConn;
      if (senderConn) senderConn.metadata = { playerId: data.playerId };
      state.players.push({ id: data.playerId, name: data.playerName, isAlive: true, isHost: false });
      renderHostLobby();
      broadcastToAll({ type: 'player_list', players: publicPlayerList() });
      break;

    case 'player_rejoin':
      if (!state.isHost) break;
      {
        const rejoiner = state.players.find(p => p.id === data.playerId);
        if (rejoiner) {
          state.playerConns[data.playerId] = senderConn;
          if (senderConn) senderConn.metadata = { playerId: data.playerId };
          senderConn.send({ type: 'rejoin_ack', success: true, gameStatus: state.gameStatus, players: publicPlayerList() });
        } else {
          senderConn.send({ type: 'rejoin_ack', success: false });
        }
      }
      break;

    case 'role_ack':
      if (!state.isHost) break;
      state.roleAcks[data.playerId] = true;
      checkAllRoleAcks();
      break;

    case 'murder_submitted':
      if (!state.isHost) break;
      processMurder(data);
      break;

    case 'alibi_submitted':
      if (!state.isHost) break;
      recordAlibi(data);
      break;

    case 'vote_submitted':
      if (!state.isHost) break;
      recordVote(data);
      break;

    case 'skip_discussion_vote':
      if (!state.isHost) break;
      recordSkipDiscussionVote(data);
      break;

    /* ---- players receive ---- */
    case 'player_list':
      state.players = data.players;
      renderPlayerLobby();
      break;

    case 'kicked':
      clearSession();
      alert('You have been removed from the room.');
      location.reload();
      break;

    case 'rejoin_ack':
      if (data.success) {
        state.players = data.players || state.players;
        if (data.gameStatus === 'lobby') {
          showScreen('screen-player-lobby');
          document.getElementById('display-my-room-code').textContent = state.roomCode;
          renderPlayerLobby();
        } else {
          showScreen('screen-waiting');
          document.getElementById('waiting-message').textContent = 'Reconnected — waiting for next phase…';
        }
      } else {
        clearSession();
        if (state.peer) { try { state.peer.destroy(); } catch (e) {} state.peer = null; }
        showScreen('screen-profile');
      }
      break;

    case 'game_start':
      handleGameStart(data);
      break;

    case 'your_murder_turn':
      showMurdererTurnScreen(data.round);
      break;

    case 'wait_for_murder':
      clearCountdown();
      showScreen('screen-waiting');
      document.getElementById('waiting-message').textContent = data.message || 'The murderer is planning their next move…';
      break;

    case 'show_crime_scene':
      handleCrimeScene(data);
      break;

    case 'start_alibi':
      handleAlibiPhase(data);
      break;

    case 'start_discussion':
      handleDiscussion(data);
      break;

    case 'start_vote':
      handleVotePhase(data);
      break;

    case 'start_voting':
      // Legacy — kept for safety but not sent by current code
      handleVotePhase(data);
      break;

    case 'vote_update':
      if (document.getElementById('vote-status')) {
        document.getElementById('vote-status').textContent = `${data.received} / ${data.total} votes received…`;
      }
      break;

    case 'skip_discussion_update':
      updateSkipDiscussionUI(data.skipCount, data.aliveCount);
      break;

    case 'show_round_results':
      handleRoundResults(data);
      break;

    case 'start_next_round':
      clearAllTimers();
      state.currentRound = data.round;
      if (data.updatedPlayers) state.players = data.updatedPlayers;
      showScreen('screen-waiting');
      document.getElementById('waiting-message').textContent =
        (data.eliminatedName ? `${data.eliminatedName} has been eliminated. ` : '') + 'Next round beginning…';
      break;

    case 'game_over':
      handleGameOver(data);
      break;

    case 'error':
      alert('Error: ' + data.message);
      break;
  }
}


function startGame() {
  const gamePlayerCount = state.hostPlaying
    ? state.players.length
    : state.players.filter(p => !p.isHost).length;
  if (gamePlayerCount < MIN_PLAYERS) return;

  state.gameStatus   = 'role_reveal';
  state.currentRound = 1;
  state.roleAcks     = {};
  state.murders      = [];
  state.hospitalRecords = [];
  state.votes        = {};
  state.alibis       = {};
  state.pendingElimination = null;

  // pick random murderer from players who are actually in the game
  const gamePlayers = state.hostPlaying ? state.players : state.players.filter(p => !p.isHost);
  const idx = Math.floor(Math.random() * gamePlayers.length);
  state.murdererPlayerId = gamePlayers[idx].id;

  const roles = {};
  gamePlayers.forEach(p => { roles[p.id] = (p.id === state.murdererPlayerId) ? 'murderer' : 'innocent'; });

  // Generate forensic profiles for all game players
  state.forensicProfiles = {};
  gamePlayers.forEach(p => { state.forensicProfiles[p.id] = generateForensicProfile(); });

  // build player list sent to clients (excludes observer host)
  const allPlayers = publicPlayerList();
  const clientPlayers = state.hostPlaying ? allPlayers : allPlayers.filter(p => !p.isHost);

  // send roles to non-host players
  state.players.forEach(p => {
    if (!p.isHost) {
      sendToPlayer(p.id, { type: 'game_start', myRole: roles[p.id], players: clientPlayers, forensicProfiles: state.forensicProfiles });
    }
  });

  if (state.hostPlaying) {
    // host participates — show their role reveal
    state.role = roles[state.playerId];
    state.roleAcks[state.playerId] = false;
    showRoleReveal(state.role);
  } else {
    // host is observer — auto-ack and wait for players
    state.role = 'observer';
    state.roleAcks[state.playerId] = true;
    showHostBoard('Game starting… waiting for players to acknowledge their roles…', TIMER_ROLE_REVEAL);
    checkAllRoleAcks();
  }

  // Force-proceed after timer even if some players haven't manually acked
  setHostTimer(TIMER_ROLE_REVEAL, () => {
    if (state.gameStatus !== 'role_reveal') return;
    const gamePlayers = state.hostPlaying ? state.players : state.players.filter(p => !p.isHost);
    gamePlayers.forEach(p => { state.roleAcks[p.id] = true; });
    beginMurdererTurn();
  });
}

function handleGameStart(data) {
  state.role             = data.myRole;
  state.players          = data.players;
  state.gameStatus       = 'role_reveal';
  state.currentRound     = 1;
  state.forensicProfiles = data.forensicProfiles || {};
  showRoleReveal(state.role);
}

function showRoleReveal(role) {
  showScreen('screen-role-reveal');
  const icon  = document.getElementById('role-icon');
  const title = document.getElementById('role-title');
  const desc  = document.getElementById('role-description');

  if (role === 'murderer') {
    icon.textContent  = '🔪';
    title.textContent = 'THE MURDERER';
    title.className   = 'role-title murderer-role';
    desc.innerHTML    = 'You are the murderer. Each round, choose a victim, pick a method, and spend your <strong>$25 budget</strong> on supplies to cover your tracks or frame someone else.<br><br>A witness may have spotted you dumping the body — <em>listen carefully to what they say</em>. You\'ll also need to provide an alibi during the investigation phase.<br><br><em>Don\'t get caught!</em>';
  } else {
    icon.textContent  = '🕵️';
    title.textContent = 'INNOCENT BYSTANDER';
    title.className   = 'role-title innocent-role';
    desc.innerHTML    = 'You are innocent. Work with the other players to identify the murderer.<br><br>After each murder, check the <strong>witness testimony</strong> for clues, then provide your alibi and cast your vote. The most-voted player will be <strong>executed</strong> — make it count!<br><br><em>Observe every clue carefully.</em>';
  }

  // Auto-acknowledge when timer runs out
  startCountdown('role-timer-text', 'role-timer-fill', TIMER_ROLE_REVEAL, acknowledgeRole);
}

function acknowledgeRole() {
  clearCountdown();
  if (state.isHost) {
    state.roleAcks[state.playerId] = true;
    checkAllRoleAcks();
  } else {
    state.hostConn.send({ type: 'role_ack', playerId: state.playerId });
    showScreen('screen-waiting');
    document.getElementById('waiting-message').textContent = 'Waiting for all players to acknowledge their roles…';
  }
}

function checkAllRoleAcks() {
  if (!state.isHost) return;
  if (state.gameStatus !== 'role_reveal') return; // already past this phase
  const playersToCheck = state.hostPlaying ? state.players : state.players.filter(p => !p.isHost);
  if (playersToCheck.every(p => state.roleAcks[p.id])) {
    clearHostTimer(); // cancel the forced-proceed timeout
    beginMurdererTurn();
  }
}

function beginMurdererTurn() {
  if (!state.isHost) return;
  if (state.gameStatus === 'murderer_turn') return; // guard double-call
  clearAllTimers();
  state.gameStatus = 'murderer_turn';

  if (state.murdererPlayerId === state.playerId) {
    showMurdererTurnScreen(state.currentRound);
  } else {
    sendToPlayer(state.murdererPlayerId, { type: 'your_murder_turn', round: state.currentRound });
    broadcastToAll(
      { type: 'wait_for_murder', message: 'The murderer is planning their next move…' },
      state.murdererPlayerId
    );
    showHostBoard('The murderer is planning their next move…', TIMER_MURDER_TURN);
    // Fallback: auto-generate a murder if murderer hasn't acted in time
    setHostTimer(TIMER_MURDER_TURN + TIMER_MURDER_FALLBACK_BUFFER, autoGenerateMurder);
  }
}

function showMurdererTurnScreen(round) {
  state.currentRound    = round;
  state.selectedVictim  = null;
  state.selectedMethod  = null;
  state.selectedSupplies = [];
  state.budgetLeft      = MURDER_BUDGET;

  showScreen('screen-murderer-turn');
  document.getElementById('murder-round-num').textContent = round;
  document.getElementById('budget-left').textContent      = MURDER_BUDGET;
  document.getElementById('budget-left-2').textContent    = MURDER_BUDGET;

  // Victims — alive players except self
  const victimDiv  = document.getElementById('victim-options');
  victimDiv.innerHTML = '';
  state.players.filter(p => p.isAlive && p.id !== state.playerId).forEach(p => {
    const el = document.createElement('div');
    el.className   = 'option-item';
    el.dataset.id  = p.id;
    el.textContent = p.name;
    el.onclick     = () => selectVictim(p.id, el);
    victimDiv.appendChild(el);
  });

  // Methods
  const methodDiv = document.getElementById('method-options');
  methodDiv.innerHTML = '';
  METHODS.forEach(m => {
    const el = document.createElement('div');
    el.className   = 'option-item';
    el.dataset.id  = m.id;
    el.textContent = m.label;
    el.onclick     = () => selectMethod(m.id, el);
    methodDiv.appendChild(el);
  });

  // Supplies
  const supplyDiv = document.getElementById('supply-options');
  supplyDiv.innerHTML = '';
  SUPPLIES.forEach(s => {
    const el = document.createElement('div');
    el.className  = 'supply-item';
    el.dataset.id = s.id;
    el.innerHTML  = `<div class="supply-name">${escapeHtml(s.name)}</div><div class="supply-cost">$${s.cost}</div><div class="supply-desc">${escapeHtml(s.desc)}</div>`;
    el.onclick    = () => toggleSupply(s, el);
    supplyDiv.appendChild(el);
  });

  updateCommitButton();

  // Auto-commit when time runs out
  startCountdown('murder-timer-text', 'murder-timer-fill', TIMER_MURDER_TURN, autoCommitMurder);
}

function selectVictim(id, el) {
  state.selectedVictim = id;
  document.querySelectorAll('#victim-options .option-item').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  updateCommitButton();
}

function selectMethod(id, el) {
  state.selectedMethod = id;
  document.querySelectorAll('#method-options .option-item').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  updateCommitButton();
}

function toggleSupply(supply, el) {
  if (el.classList.contains('selected')) {
    state.selectedSupplies = state.selectedSupplies.filter(s => s.id !== supply.id);
    el.classList.remove('selected');
    state.budgetLeft += supply.cost;
  } else {
    if (state.budgetLeft < supply.cost) return;
    state.selectedSupplies.push(supply);
    el.classList.add('selected');
    state.budgetLeft -= supply.cost;
  }
  document.getElementById('budget-left').textContent   = state.budgetLeft;
  document.getElementById('budget-left-2').textContent = state.budgetLeft;

  // grey out unaffordable items
  document.querySelectorAll('.supply-item').forEach(btn => {
    if (btn.classList.contains('selected')) { btn.classList.remove('disabled'); return; }
    const s = SUPPLIES.find(x => x.id === btn.dataset.id);
    btn.classList.toggle('disabled', !!(s && s.cost > state.budgetLeft));
  });
}

function updateCommitButton() {
  document.getElementById('btn-commit').disabled = !(state.selectedVictim && state.selectedMethod);
}

function commitMurder() {
  if (!state.selectedVictim || !state.selectedMethod) {
    showError('error-murder', 'Please choose both a victim and a method.');
    return;
  }
  clearCountdown();
  const msg = {
    type:     'murder_submitted',
    victimId: state.selectedVictim,
    method:   state.selectedMethod,
    supplies: state.selectedSupplies,
    round:    state.currentRound,
    playerId: state.playerId,
  };
  if (state.isHost) {
    processMurder(msg);
  } else {
    state.hostConn.send(msg);
    showScreen('screen-waiting');
    document.getElementById('waiting-message').textContent = 'Processing your actions…';
  }
}

function processMurder(data) {
  if (!state.isHost) return;
  if (state.gameStatus !== 'murderer_turn') return; // ignore duplicate submissions
  clearHostTimer(); // cancel fallback auto-generate timer
  const victim = state.players.find(p => p.id === data.victimId);
  if (!victim) return;

  const location    = randomFrom(LOCATIONS);
  const dumpLocation = randomFrom(DUMP_LOCATIONS);
  const methodLabel = (METHODS.find(m => m.id === data.method) || {}).label || data.method;

  // Shooting special logic
  // Outcome probabilities (mutually exclusive, applied to total):
  //   2.5%  → victim shoots back (rand < 0.025): murderer hospitalized, victim still dies
  //   5.0%  → victim survives (0.025 <= rand < 0.075): murder attempt failed, victim stays alive
  //   92.5% → normal kill (rand >= 0.075)
  // Window chance (25%) is rolled independently and can combine with any outcome above.
  let victimSurvived = false;
  let murdererHospitalized = false;
  let throughWindow = false;
  let shootingNote = null;

  if (data.method === 'shoot') {
    throughWindow = Math.random() < 0.25;
    const rand = Math.random();
    if (rand < 0.025) {
      // 2.5%: victim shoots back — murderer hospitalized, victim still dies
      murdererHospitalized = true;
      const murderer = state.players.find(p => p.id === state.murdererPlayerId);
      const murdererName = murderer ? murderer.name : 'Unknown';
      state.hospitalRecords.push({ round: data.round, murdererName });
      shootingNote = throughWindow
        ? 'The shot was fired through a window. The victim managed to return fire before dying — someone was admitted to a local hospital with a gunshot wound.'
        : 'The victim managed to return fire before dying — someone was admitted to a local hospital with a gunshot wound.';
    } else if (rand < 0.075) {
      // 5% (range 0.025–0.075): victim survives — murder attempt failed
      victimSurvived = true;
      shootingNote = throughWindow
        ? 'The shot was fired through a window but the victim survived the attack.'
        : 'The victim survived the attack.';
    } else {
      // 92.5% (range 0.075–1.0): normal kill
      if (throughWindow) {
        shootingNote = 'The shot was fired through a window.';
      }
    }
  }

  if (!victimSurvived) {
    victim.isAlive = false;
  }

  const witnessClue = (!victimSurvived) ? generateWitnessClue(dumpLocation) : null;

  // Build forensic evidence left at scene by the murderer
  const murdererProfile = state.forensicProfiles[state.murdererPlayerId];
  const sceneForensics  = murdererProfile ? buildSceneForensics(murdererProfile, data.supplies) : [];

  const murder = {
    round:          data.round,
    victimId:       data.victimId,
    victimName:     victim.name,
    method:         methodLabel,
    location:       location,
    supplies:       data.supplies || [],
    dumpLocation:   dumpLocation,
    witnessClue:    witnessClue,
    sceneForensics: sceneForensics,
    round:        data.round,
    victimId:     data.victimId,
    victimName:   victim.name,
    method:       methodLabel,
    location:     location,
    supplies:     data.supplies || [],
    dumpLocation: dumpLocation,
    witnessClue:  witnessClue,
    victimSurvived,
    murdererHospitalized,
    throughWindow,
    shootingNote,
  };
  state.murders.push(murder);
  state.gameStatus = 'crime_scene';
  state.votes[data.round] = {};

  const msg = {
    type:         'show_crime_scene',
    murder:       murder,
    alivePlayers: publicPlayerList().filter(p => p.isAlive),
    round:        data.round,
  };
  broadcastToAll(msg);
  handleCrimeScene(msg);
}

function handleCrimeScene(data) {
  // Sync alive status for non-host players so dead-player checks work later
  if (!state.isHost && data.alivePlayers) {
    const aliveIds = new Set(data.alivePlayers.map(p => p.id));
    state.players = state.players.map(p => ({ ...p, isAlive: aliveIds.has(p.id) }));
  }

  showScreen('screen-crime-scene');
  const { murder, alivePlayers } = data;

  const victimLine = murder.victimSurvived
    ? `<div class="victim-name">${escapeHtml(murder.victimName)}</div>
       <div class="crime-description">survived a murder attempt in <strong>${escapeHtml(murder.location)}</strong></div>
       <div class="crime-method">Attack method: <strong>${escapeHtml(murder.method)}</strong></div>`
    : `<div class="victim-name">${escapeHtml(murder.victimName)}</div>
       <div class="crime-description">was found dead in <strong>${escapeHtml(murder.location)}</strong></div>
       <div class="crime-method">Cause of death: <strong>${escapeHtml(murder.method)}</strong></div>`;

  document.getElementById('crime-details').innerHTML =
    victimLine + `<div class="crime-round">Round ${escapeHtml(String(murder.round))}</div>`;

  const supDiv = document.getElementById('crime-supplies');
  if (murder.supplies && murder.supplies.length > 0) {
    supDiv.innerHTML = murder.supplies.map(s =>
      `<div class="evidence-item">🔍 ${escapeHtml(s.name)} ($${s.cost}) — ${escapeHtml(s.desc)}</div>`
    ).join('');
  } else {
    supDiv.innerHTML = '<div class="evidence-item">No items found at the scene.</div>';
  }

  // Forensic evidence section
  const forensicBox  = document.getElementById('forensic-evidence-box');
  const forensicList = document.getElementById('forensic-evidence-list');
  if (forensicBox && forensicList && murder.sceneForensics && murder.sceneForensics.length > 0) {
    forensicList.innerHTML = murder.sceneForensics.map(e =>
      `<div class="forensic-evidence-item forensic-type-${escapeHtml(e.type)}">
         <span class="fe-icon">${e.icon}</span>
         <div class="fe-body">
           <span class="fe-label">${escapeHtml(e.label)}</span>
           <span class="fe-value">${escapeHtml(e.value)}</span>
           <span class="fe-note">${escapeHtml(e.note)}</span>
         </div>
       </div>`
    ).join('');
    forensicBox.style.display = 'block';
  } else if (forensicBox) {
    forensicBox.style.display = 'none';
  }

  const witnessEl = document.getElementById('witness-testimony');
  if (witnessEl && murder.witnessClue) {
    witnessEl.textContent = murder.witnessClue;
    document.getElementById('witness-box').style.display = 'block';
  } else if (document.getElementById('witness-box')) {
    document.getElementById('witness-box').style.display = 'none';
  }

  // Shooting outcome note
  const shootingBox = document.getElementById('shooting-outcome-box');
  const shootingText = document.getElementById('shooting-outcome-text');
  if (shootingBox && shootingText && murder.shootingNote) {
    shootingText.textContent = murder.shootingNote;
    shootingBox.style.display = 'block';
  } else if (shootingBox) {
    shootingBox.style.display = 'none';
  }

  // Hospital record clue (anonymous — doesn't name the murderer)
  const hospitalBox = document.getElementById('hospital-record-box');
  const hospitalText = document.getElementById('hospital-record-text');
  if (hospitalBox && hospitalText && murder.murdererHospitalized) {
    hospitalText.textContent = 'Hospital records show that an individual was admitted with a gunshot wound around the time of this incident.';
    hospitalBox.style.display = 'block';
  } else if (hospitalBox) {
    hospitalBox.style.display = 'none';
  }

  document.getElementById('still-alive').innerHTML =
    alivePlayers.map(p => `<div class="player-tag">${escapeHtml(p.name)}</div>`).join('');

  const proceedBtn   = document.getElementById('btn-proceed-vote');
  const waitingLabel = document.getElementById('crime-scene-status');

  clearAllTimers();
  if (state.isHost) {
    proceedBtn.style.display   = 'block';
    waitingLabel.style.display = 'none';
    startCountdown('crime-timer-text', 'crime-timer-fill', TIMER_CRIME_SCENE, () => {
      if (state.gameStatus === 'crime_scene') hostProceedToAlibi();
    });
  } else {
    proceedBtn.style.display   = 'none';
    waitingLabel.style.display = 'block';
    startCountdown('crime-timer-text', 'crime-timer-fill', TIMER_CRIME_SCENE, null);
  }
}

function hostProceedToAlibi() {
  if (!state.isHost) return;
  if (state.gameStatus !== 'crime_scene') return;
  clearAllTimers();

  // observer host doesn't count as an innocent
  const aliveInnocents = state.players.filter(p =>
    p.isAlive && p.id !== state.murdererPlayerId && (state.hostPlaying || !p.isHost)
  );
  if (aliveInnocents.length === 0) {
    endGame('murderer');
    return;
  }

  state.gameStatus = 'alibi';
  state.alibiSubmitted = false;

  const alive = publicPlayerList()
    .filter(p => p.isAlive && (state.hostPlaying || !p.isHost));

  const msg = { type: 'start_alibi', alivePlayers: alive, round: state.currentRound };
  broadcastToAll(msg);
  handleAlibiPhase(msg);

  // Proceed to discussion after alibi timer (or when all alibis received)
  setHostTimer(TIMER_ALIBI, () => {
    if (state.gameStatus === 'alibi') hostStartDiscussion();
  });
}

function handleAlibiPhase(data) {
  if (state.isHost && !state.hostPlaying) {
    showHostBoard('Players are writing their alibis…', TIMER_ALIBI);
    return;
  }

  const myPlayerInfo = state.players.find(p => p.id === state.playerId);
  if (myPlayerInfo && !myPlayerInfo.isAlive) {
    showScreen('screen-waiting');
    document.getElementById('waiting-message').textContent = 'You have been eliminated. Watching the investigation…';
    return;
  }

  showScreen('screen-alibi');
  state.alibiSubmitted = false;
  const alibiInput = document.getElementById('input-alibi');
  if (alibiInput) alibiInput.value = '';
  const alibiStatus = document.getElementById('alibi-status');
  if (alibiStatus) alibiStatus.textContent = '';
  const btn = document.getElementById('btn-submit-alibi');
  if (btn) btn.disabled = false;

  startCountdown('alibi-timer-text', 'alibi-timer-fill', TIMER_ALIBI, autoSubmitAlibi);
}

function submitAlibi() {
  if (state.alibiSubmitted) return;
  state.alibiSubmitted = true;
  clearCountdown();

  const alibiEl = document.getElementById('input-alibi');
  const alibi   = alibiEl ? alibiEl.value.trim().slice(0, 150) : '';

  const btn = document.getElementById('btn-submit-alibi');
  if (btn) btn.disabled = true;
  const alibiStatus = document.getElementById('alibi-status');
  if (alibiStatus) alibiStatus.textContent = 'Alibi submitted! Waiting for others…';

  const msg = { type: 'alibi_submitted', playerId: state.playerId, alibi, round: state.currentRound };
  if (state.isHost) {
    recordAlibi(msg);
  } else {
    state.hostConn.send(msg);
  }
}

function autoSubmitAlibi() {
  if (!state.alibiSubmitted) submitAlibi();
}

function recordAlibi(data) {
  if (!state.isHost) return;
  if (state.gameStatus !== 'alibi') return;
  if (!state.alibis[data.round]) state.alibis[data.round] = {};
  state.alibis[data.round][data.playerId] = data.alibi;

  if (!state.hostPlaying) refreshHostBoard();

  const expectedPlayers = state.players.filter(p => p.isAlive && (state.hostPlaying || !p.isHost));
  const received = Object.keys(state.alibis[data.round]).length;

  if (received >= expectedPlayers.length) {
    clearHostTimer();
    hostStartDiscussion();
  }
}

function hostStartDiscussion() {
  if (!state.isHost) return;
  if (state.gameStatus !== 'alibi') return;
  clearHostTimer();
  state.gameStatus = 'discussion';

  const allPlayers  = publicPlayerList();
  const roundAlibis = state.alibis[state.currentRound] || {};
  const alibis      = Object.entries(roundAlibis).map(([pid, text]) => ({
    playerId:   pid,
    playerName: (state.players.find(p => p.id === pid) || {}).name || 'Unknown',
    alibi:      text,
  }));

  state.skipVotes = [];

  const msg = { type: 'start_discussion', players: allPlayers, round: state.currentRound, alibis };
  broadcastToAll(msg);
  handleDiscussion(msg);

  setHostTimer(TIMER_DISCUSSION, () => {
    if (state.gameStatus === 'discussion') hostStartVote();
  });
}

function handleDiscussion(data) {
  if (state.isHost && !state.hostPlaying) {
    showHostBoard('Discussion phase — review alibis and talk it out…', TIMER_DISCUSSION);
    return;
  }

  showScreen('screen-discussion');

  const playerList = document.getElementById('disc-player-list');
  if (playerList) {
    playerList.innerHTML = '';
    (data.players || []).forEach(p => {
      const div = document.createElement('div');
      div.className = 'player-tag' + (p.isAlive ? '' : ' player-tag-dead');
      div.textContent = p.name + (p.isAlive ? '' : ' 💀');
      playerList.appendChild(div);
    });
  }

  const discAlibisSection = document.getElementById('disc-alibis-section');
  const discAlibisList    = document.getElementById('disc-alibis-list');
  if (discAlibisSection && discAlibisList) {
    if (data.alibis && data.alibis.length > 0) {
      discAlibisList.innerHTML = data.alibis.map(a => {
        const alibiContent = a.alibi
          ? `<span class="alibi-text">${escapeHtml(a.alibi)}</span>`
          : `<em class="alibi-empty alibi-text">No alibi provided.</em>`;
        return `<div class="alibi-item">
           <span class="alibi-player">${escapeHtml(a.playerName)}</span>
           ${alibiContent}
         </div>`;
      }).join('');
      discAlibisSection.style.display = 'block';
    } else {
      discAlibisSection.style.display = 'none';
    }
  }

  const skipBtn = document.getElementById('btn-skip-discussion');
  if (skipBtn) {
    skipBtn.style.display = 'block';
    skipBtn.disabled = false;
    skipBtn.textContent = 'Vote to Skip ✋';
  }
  const skipCount = document.getElementById('disc-skip-count');
  if (skipCount) skipCount.textContent = '';

  startCountdown('disc-timer-text', 'disc-timer-fill', TIMER_DISCUSSION, () => {
    if (state.gameStatus === 'discussion') hostStartVote();
  });
}

function hostSkipDiscussion() {
  if (!state.isHost || state.gameStatus !== 'discussion') return;
  clearAllTimers();
  hostStartVote();
}

function playerVoteSkipDiscussion() {
  if (state.gameStatus !== 'discussion') return;
  const skipBtn = document.getElementById('btn-skip-discussion');
  if (skipBtn) skipBtn.disabled = true;
  if (state.isHost) {
    recordSkipDiscussionVote({ playerId: state.playerId });
  } else {
    state.hostConn.send({ type: 'skip_discussion_vote', playerId: state.playerId });
  }
}

function recordSkipDiscussionVote(data) {
  if (!state.isHost) return;
  if (state.gameStatus !== 'discussion') return;
  if (!state.skipVotes.includes(data.playerId)) {
    state.skipVotes.push(data.playerId);
  }
  const aliveCount = state.players.filter(p => p.isAlive).length;
  const skipCount  = state.skipVotes.length;
  broadcastToAll({ type: 'skip_discussion_update', skipCount, aliveCount });
  updateSkipDiscussionUI(skipCount, aliveCount);
  if (skipCount > aliveCount / 2) {
    clearAllTimers();
    hostStartVote();
  }
}

function updateSkipDiscussionUI(skipCount, aliveCount) {
  const label = document.getElementById('disc-skip-count');
  if (label) label.textContent = `${skipCount} / ${aliveCount} want to skip`;
}

function hostStartVote() {
  if (!state.isHost) return;
  if (state.gameStatus !== 'discussion') return;
  clearHostTimer();
  state.gameStatus = 'vote';

  const alive = publicPlayerList()
    .filter(p => p.isAlive && (state.hostPlaying || !p.isHost));

  const msg = { type: 'start_vote', alivePlayers: alive, round: state.currentRound, totalVoters: alive.length };
  broadcastToAll(msg);
  handleVotePhase(msg);

  setHostTimer(TIMER_VOTE, () => {
    if (state.gameStatus === 'vote') tallyVotes(state.currentRound);
  });
}

function handleStartVoting(data) {
  // Store updated profiles if provided
  if (data.forensicProfiles) state.forensicProfiles = data.forensicProfiles;
  handleVotePhase(data);
}

// observer host gets a read-only watch screen during voting
function handleVotePhase(data) {
  if (state.isHost && !state.hostPlaying) {
    const total = data.totalVoters || data.alivePlayers.length;
    showHostBoard(`Voting in progress… 0 / ${total} votes received.`, TIMER_VOTE);
    return;
  }

  const myPlayerInfo = state.players.find(p => p.id === state.playerId);
  if (myPlayerInfo && !myPlayerInfo.isAlive) {
    showScreen('screen-waiting');
    document.getElementById('waiting-message').textContent = 'You have been eliminated. Watching the vote…';
    return;
  }

  showScreen('screen-investigation');
  state.myVote = null;
  const total = data.totalVoters || data.alivePlayers.length;
  document.getElementById('vote-status').textContent = `Waiting for votes (0 / ${total})…`;

  const div = document.getElementById('vote-options');
  div.innerHTML = '';
  data.alivePlayers.forEach(p => {
    const el = document.createElement('div');
    el.className   = 'option-item';
    el.dataset.id  = p.id;
    el.textContent = p.name + (p.id === state.playerId ? ' (You)' : '');
    el.onclick     = () => selectVote(p.id, el);
    div.appendChild(el);
  });

  document.getElementById('btn-vote').disabled = true;

  // Render forensic lab panel
  renderForensicPanel(data.alivePlayers, data.forensicProfiles || {}, data.sceneForensics || []);
}

function renderForensicPanel(suspects, profiles, sceneForensics) {
  const panel = document.getElementById('forensic-panel');
  if (!panel) return;

  // Scene evidence summary
  const sceneDiv = document.getElementById('forensic-scene-summary');
  if (sceneDiv && sceneForensics.length > 0) {
    sceneDiv.innerHTML = sceneForensics.map(e =>
      `<div class="fe-scene-item">
         <span class="fe-icon">${e.icon}</span>
         <span class="fe-label">${escapeHtml(e.label)}:</span>
         <span class="fe-value">${escapeHtml(e.value)}</span>
       </div>`
    ).join('');
  }

  // Suspect profiles
  const suspList = document.getElementById('forensic-suspects-list');
  if (!suspList) return;
  suspList.innerHTML = '';

  suspects.forEach(p => {
    const prof = profiles[p.id];
    if (!prof) return;
    const card = document.createElement('div');
    card.className = 'forensic-suspect-card';
    card.innerHTML =
      `<div class="fsc-name">${escapeHtml(p.name)}</div>
       <div class="fsc-row">
         <span class="fsc-icon">🧬</span>
         <span class="fsc-field">DNA</span>
         <span class="fsc-val dna-seq">${escapeHtml(prof.dna)}</span>
       </div>
       <div class="fsc-row">
         <span class="fsc-icon">👆</span>
         <span class="fsc-field">Fingerprint</span>
         <span class="fsc-val">${escapeHtml(prof.fingerprint)}</span>
       </div>
       <div class="fsc-row">
         <span class="fsc-icon">✋</span>
         <span class="fsc-field">Palm Print</span>
         <span class="fsc-val">${escapeHtml(prof.palmPrint)}</span>
       </div>`;
    suspList.appendChild(card);
  });

  panel.style.display = suspects.length > 0 ? 'block' : 'none';
  startCountdown('vote-timer-text', 'vote-timer-fill', TIMER_VOTE, autoSubmitVote);
}

function autoSubmitVote() {
  const btn = document.getElementById('btn-vote');
  if (!btn || btn.disabled) return; // already submitted
  if (!state.myVote) {
    const options = Array.from(document.querySelectorAll('#vote-options .option-item'));
    if (options.length > 0) {
      const pick = randomFrom(options);
      selectVote(pick.dataset.id, pick);
    }
  }
  if (state.myVote) submitVote();
}

function selectVote(id, el) {
  state.myVote = id;
  document.querySelectorAll('#vote-options .option-item').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('btn-vote').disabled = false;
}

function submitVote() {
  if (!state.myVote) return;
  clearCountdown();
  document.getElementById('btn-vote').disabled = true;
  document.getElementById('vote-status').textContent = 'Vote submitted! Waiting for others…';

  const msg = { type: 'vote_submitted', voterId: state.playerId, suspectId: state.myVote, round: state.currentRound };
  if (state.isHost) {
    recordVote(msg);
  } else {
    state.hostConn.send(msg);
  }
}

function recordVote(data) {
  if (!state.isHost) return;
  if (state.gameStatus !== 'vote') return; // ignore stale submissions
  if (!state.votes[data.round]) state.votes[data.round] = {};
  state.votes[data.round][data.voterId] = data.suspectId;

  // observer host is not a voter — exclude from total
  const aliveTotal = state.players.filter(p => p.isAlive && (state.hostPlaying || !p.isHost)).length;
  const received   = Object.keys(state.votes[data.round]).length;

  broadcastToAll({ type: 'vote_update', received, total: aliveTotal });
  // update host's own display (board when observing, investigation screen when playing)
  if (!state.hostPlaying) {
    const statusMsg = `Voting in progress… ${received} / ${aliveTotal} votes received.`;
    const boardStatus = document.getElementById('board-status');
    if (boardStatus) boardStatus.textContent = statusMsg;
  } else {
    document.getElementById('vote-status').textContent = `${received} / ${aliveTotal} votes received…`;
  }

  if (received >= aliveTotal) {
    clearHostTimer();
    tallyVotes(data.round);
  }
}

function tallyVotes(round) {
  if (!state.isHost) return;
  clearHostTimer();

  const roundVotes = state.votes[round] || {};
  const counts = {};
  Object.values(roundVotes).forEach(sid => { counts[sid] = (counts[sid] || 0) + 1; });

  const suspects = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUSPECTS)
    .map(([id, votes]) => ({ id, name: (state.players.find(p => p.id === id) || {}).name || 'Unknown', votes }));

  const murdererName = (state.players.find(p => p.id === state.murdererPlayerId) || {}).name || 'Unknown';

  // Eliminate the top-voted player
  let eliminatedName = null;
  let murdererCaught = false;
  if (suspects.length > 0) {
    const topPlayer = state.players.find(p => p.id === suspects[0].id);
    if (topPlayer) {
      topPlayer.isAlive  = false;
      eliminatedName     = topPlayer.name;
      murdererCaught     = topPlayer.id === state.murdererPlayerId;
    }
  }

  const roundAlibis = state.alibis[round] || {};
  const alibis = Object.entries(roundAlibis).map(([pid, text]) => ({
    playerId:   pid,
    playerName: (state.players.find(p => p.id === pid) || {}).name || 'Unknown',
    alibi:      text,
  }));

  // Determine who gets eliminated when murderer escapes
  // Only alive non-murderer players can be eliminated
  let eliminationTarget = null;
  if (!murdererCaught && suspects.length > 0) {
    const topSuspect = suspects.find(s => s.id !== state.murdererPlayerId);
    if (topSuspect) {
      eliminationTarget = { id: topSuspect.id, name: topSuspect.name };
      state.pendingElimination = eliminationTarget;
    }
  } else {
    state.pendingElimination = null;
  }

  const msg = { type: 'show_round_results', suspects, murdererCaught, murdererName, eliminatedName, round, alibis, eliminationTarget };
  broadcastToAll(msg);
  handleRoundResults(msg);
}

function handleRoundResults(data) {
  showScreen('screen-round-results');
  state.gameStatus = 'round_results';

  document.getElementById('suspects-list').innerHTML = data.suspects.map((s, i) =>
    `<div class="suspect-item">
       <span class="suspect-rank">#${i + 1}</span>
       <span class="suspect-name">${escapeHtml(s.name)}</span>
       <span class="suspect-votes">${s.votes} vote${s.votes !== 1 ? 's' : ''}</span>
     </div>`
  ).join('');

  const alibisSection = document.getElementById('alibis-section');
  const alibisList    = document.getElementById('alibis-list');
  if (alibisSection && alibisList && data.alibis && data.alibis.length > 0) {
    alibisList.innerHTML = data.alibis.map(a => {
      const alibiContent = a.alibi
        ? `<span class="alibi-text">${escapeHtml(a.alibi)}</span>`
        : `<em class="alibi-empty alibi-text">No alibi provided.</em>`;
      return `<div class="alibi-item">
         <span class="alibi-player">${escapeHtml(a.playerName)}</span>
         ${alibiContent}
       </div>`;
    }).join('');
    alibisSection.style.display = 'block';
  } else if (alibisSection) {
    alibisSection.style.display = 'none';
  }

  const verdict = document.getElementById('round-verdict');
  const nextBtn  = document.getElementById('btn-next-round');
  const statusP  = document.getElementById('results-status');

  if (data.murdererCaught) {
    verdict.innerHTML =
      `<div class="verdict caught">
         🎉 THE MURDERER HAS BEEN IDENTIFIED!
         <div class="verdict-name">${escapeHtml(data.murdererName)} was the murderer!</div>
         ${data.eliminatedName ? `<div class="verdict-sub">⚰️ ${escapeHtml(data.eliminatedName)} was executed by the group.</div>` : ''}
         <div class="verdict-sub">The players have won!</div>
       </div>`;
    nextBtn.style.display  = 'none';
    statusP.style.display  = 'none';
    // Give everyone time to read, then go to game over screen
    setTimeout(() => {
      if (state.isHost) endGame('players');
      else {
        showScreen('screen-waiting');
        document.getElementById('waiting-message').textContent = 'Game over! Revealing final results…';
      }
    }, 3500);
  } else {
    const elimName = data.eliminationTarget ? data.eliminationTarget.name : null;
    const elimLine = elimName
      ? `<div class="elimination-notice">🚫 <strong>${escapeHtml(elimName)}</strong> will be eliminated — they received the most votes.</div>`
      : '';
    const eliminationMsg = data.eliminatedName
      ? `⚰️ ${escapeHtml(data.eliminatedName)} was executed — but they were not the murderer.`
      : '❌ No one was eliminated.';
    verdict.innerHTML =
      `<div class="verdict escaped">
         ${eliminationMsg}
         <div class="verdict-sub">The killer remains at large…</div>
         ${elimLine}
       </div>`;
    if (state.isHost) {
      nextBtn.textContent    = elimName ? `Eliminate ${elimName} & Continue →` : 'Continue to Next Round →';
      nextBtn.style.display  = 'block';
      statusP.style.display  = 'none';
    } else {
      nextBtn.style.display  = 'none';
      statusP.style.display  = 'block';
      statusP.textContent    = 'Waiting for host to continue…';
    }
  }
}

function hostNextRound() {
  if (!state.isHost) return;

  // Apply pending elimination (voted-off suspect from previous round)
  let eliminatedName = null;
  if (state.pendingElimination) {
    const toElim = state.players.find(p => p.id === state.pendingElimination.id);
    if (toElim) {
      toElim.isAlive = false;
      eliminatedName = toElim.name;
    }
    state.pendingElimination = null;
  }

  state.currentRound++;

  // Check win condition for murderer (observer host doesn't count as an innocent)
  const aliveInnocents = state.players.filter(p =>
    p.isAlive && p.id !== state.murdererPlayerId && (state.hostPlaying || !p.isHost)
  );
  if (aliveInnocents.length === 0) { endGame('murderer'); return; }

  broadcastToAll({
    type:           'start_next_round',
    round:          state.currentRound,
    updatedPlayers: publicPlayerList(),
    eliminatedName,
  });
  beginMurdererTurn();
}

function endGame(winner) {
  if (!state.isHost) return;
  state.gameStatus = 'game_over';
  state.winner = winner;
  const murdererName = (state.players.find(p => p.id === state.murdererPlayerId) || {}).name || 'Unknown';
  const msg = { type: 'game_over', winner, murdererName, murders: state.murders, hospitalRecords: state.hospitalRecords };
  broadcastToAll(msg);
  handleGameOver(msg);
}

function handleGameOver(data) {
  state.gameStatus = 'game_over';
  clearSession();
  showScreen('screen-game-over');

  const icon    = document.getElementById('gameover-icon');
  const title   = document.getElementById('gameover-title');
  const message = document.getElementById('gameover-message');
  const reveal  = document.getElementById('gameover-reveal');

  if (data.winner === 'players') {
    icon.textContent    = '🎉';
    title.textContent   = 'PLAYERS WIN!';
    message.textContent = 'The murderer has been identified and brought to justice!';
  } else {
    icon.textContent    = '💀';
    title.textContent   = 'MURDERER WINS!';
    message.textContent = 'The murderer has escaped justice once more…';
  }

  reveal.innerHTML =
    `<div class="reveal-murderer">The murderer was: <strong>${escapeHtml(data.murdererName || 'Unknown')}</strong></div>` +
    (data.hospitalRecords && data.hospitalRecords.length > 0
      ? `<div class="murder-log">
           <h4>🏥 Hospital Records (Murderer)</h4>
           ${data.hospitalRecords.map(r =>
               `<div class="murder-log-item">Round ${escapeHtml(String(r.round))}: <strong>${escapeHtml(r.murdererName)}</strong> was hospitalized after being shot by their victim</div>`
             ).join('')}
         </div>`
      : '') +
    (data.murders && data.murders.length > 0
      ? `<div class="murder-log">
           <h4>Murder Log</h4>
           ${data.murders.map(m =>
               `<div class="murder-log-item">Round ${escapeHtml(String(m.round))}: <strong>${escapeHtml(m.victimName)}</strong>${m.victimSurvived ? ' (survived)' : ''} — ${escapeHtml(m.method)} in ${escapeHtml(m.location)}</div>`
             ).join('')}
         </div>`
      : '');
}

/* ============================================================
   PAGE LOAD — prefill name & attempt auto-rejoin
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Prefill player name from localStorage
  const savedName = loadPlayerName();
  if (savedName) {
    document.getElementById('input-player-name').value = savedName;
  }

  // Check for a URL invite link (e.g. #join/ABC123) and pre-fill the room code
  const hashMatch = location.hash.slice(1).match(/^join\/([A-Za-z0-9]{4,10})$/);
  if (hashMatch) {
    const pendingCode = hashMatch[1].toUpperCase();
    document.getElementById('input-room-code').value = pendingCode;
    // Clear the hash so it doesn't linger after the code is consumed
    history.replaceState(null, '', location.pathname);
    // If the player already has a name saved, skip straight to the join screen
    if (savedName) {
      state.playerName = savedName;
      state.isHost     = false;
      state.playerId   = generatePlayerId();
      showScreen('screen-join');
    }
    return; // skip session rejoin — user is intentionally joining a new game via invite link
  }

  // Check for a saved player (non-host) session to rejoin
  const session = loadSession();
  if (session && !session.isHost && session.playerId && session.playerName && session.roomCode) {
    attemptRejoin(session);
  }
});

function attemptRejoin(session) {
  state.playerName = session.playerName;
  state.playerId   = session.playerId;
  state.roomCode   = session.roomCode;
  state.isHost     = false;

  showScreen('screen-waiting');
  document.getElementById('waiting-message').textContent = 'Reconnecting to game…';

  state.peer = new Peer(undefined, PEER_CONFIG);

  let resolved = false;

  function onFail() {
    if (resolved) return;
    resolved = true;
    clearSession();
    try { if (state.peer) state.peer.destroy(); } catch (e) {}
    state.peer = null;
    showScreen('screen-profile');
  }

  state.peer.on('open', () => {
    const conn = state.peer.connect('tl-' + state.roomCode, { metadata: { playerId: state.playerId } });

    conn.on('open', () => {
      state.hostConn = conn;
      conn.send({ type: 'player_rejoin', playerId: state.playerId, playerName: state.playerName });
    });

    conn.on('data', data => {
      if (!resolved && data.type === 'rejoin_ack') resolved = true;
      handleMessage(data, null);
    });

    conn.on('error', onFail);
    conn.on('close', () => {
      if (state.gameStatus !== 'game_over') alert('Disconnected from host.');
    });

    setTimeout(() => { if (!resolved) onFail(); }, REJOIN_TIMEOUT_MS);
  });

  state.peer.on('error', onFail);
}
