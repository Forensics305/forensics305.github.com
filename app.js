'use strict';
const ACCESS_CODE    = 'YOUNG305';
const MURDER_BUDGET  = 25;
const MIN_PLAYERS    = 3;
const MAX_SUSPECTS   = 5;

const METHODS = [
  { id: 'stab',     label: '🗡️ Stabbing' },
  { id: 'poison',   label: '☠️ Poisoning' },
  { id: 'strangle', label: '🤚 Strangling' },
  { id: 'blunt',    label: '🔨 Blunt Force Trauma' },
  { id: 'suffoc',   label: '🛏️ Suffocation' },
  { id: 'drown',    label: '🌊 Drowning' },
  { id: 'push',     label: '⬇️ Pushed from Height' },
  { id: 'elec',     label: '⚡ Electrocution' },
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

  // voting
  myVote:          null,
  votes:           {},        // host: {round: {voterId: suspectId}}

  // alibis
  alibis:          {},        // host: {round: {playerId: alibiText}}

  // role acknowledgement (host)
  roleAcks:        {},
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

function checkAccessCode() {
  const val = document.getElementById('input-access-code').value.trim().toUpperCase();
  if (val === ACCESS_CODE) {
    showScreen('screen-profile');
  } else {
    showError('error-access', 'Incorrect access code. Try again.');
    document.getElementById('input-access-code').value = '';
  }
}

document.getElementById('input-access-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') checkAccessCode();
});

function getValidName() {
  const name = document.getElementById('input-player-name').value.trim();
  if (!name) { showError('error-profile', 'Please enter your name.'); return null; }
  if (name.length > 20) { showError('error-profile', 'Name must be 20 characters or less.'); return null; }
  return name;
}

function createRoom() {
  const name = getValidName();
  if (!name) return;
  state.playerName = name;
  state.isHost     = true;
  state.playerId   = generatePlayerId();
  initHostPeer();
}

function showJoinScreen() {
  const name = getValidName();
  if (!name) return;
  state.playerName = name;
  state.isHost     = false;
  state.playerId   = generatePlayerId();
  showScreen('screen-join');
}

document.getElementById('input-player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') createRoom();
});

function initHostPeer() {
  const code = generateRoomCode();
  state.roomCode = code;
  showScreen('screen-host-lobby');
  document.getElementById('display-room-code').textContent = code;

  state.peer = new Peer('tl-' + code);

  state.peer.on('open', () => {
    state.players = [{ id: state.playerId, name: state.playerName, isAlive: true, isHost: true }];
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

function copyRoomCode() {
  const code = state.roomCode;
  const btn = document.querySelector('#screen-host-lobby .btn-copy');
  navigator.clipboard.writeText(code).then(() => {
    if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
  }).catch(() => { prompt('Copy this room code:', code); });
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
  state.peer = new Peer();
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

    case 'role_ack':
      if (!state.isHost) break;
      state.roleAcks[data.playerId] = true;
      checkAllRoleAcks();
      break;

    case 'murder_submitted':
      if (!state.isHost) break;
      processMurder(data);
      break;

    case 'vote_submitted':
      if (!state.isHost) break;
      recordVote(data);
      break;

    /* ---- players receive ---- */
    case 'player_list':
      state.players = data.players;
      renderPlayerLobby();
      break;

    case 'kicked':
      alert('You have been removed from the room.');
      location.reload();
      break;

    case 'game_start':
      handleGameStart(data);
      break;

    case 'your_murder_turn':
      showMurdererTurnScreen(data.round);
      break;

    case 'wait_for_murder':
      showScreen('screen-waiting');
      document.getElementById('waiting-message').textContent = data.message || 'The murderer is planning their next move…';
      break;

    case 'show_crime_scene':
      handleCrimeScene(data);
      break;

    case 'start_voting':
      handleStartVoting(data);
      break;

    case 'vote_update':
      document.getElementById('vote-status').textContent = `${data.received} / ${data.total} votes received…`;
      break;

    case 'show_round_results':
      handleRoundResults(data);
      break;

    case 'start_next_round':
      state.currentRound = data.round;
      showScreen('screen-waiting');
      document.getElementById('waiting-message').textContent = 'Next round beginning…';
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
  state.votes        = {};
  state.alibis       = {};

  // pick random murderer from players who are actually in the game
  const gamePlayers = state.hostPlaying ? state.players : state.players.filter(p => !p.isHost);
  const idx = Math.floor(Math.random() * gamePlayers.length);
  state.murdererPlayerId = gamePlayers[idx].id;

  const roles = {};
  gamePlayers.forEach(p => { roles[p.id] = (p.id === state.murdererPlayerId) ? 'murderer' : 'innocent'; });

  // build player list sent to clients (excludes observer host)
  const allPlayers = publicPlayerList();
  const clientPlayers = state.hostPlaying ? allPlayers : allPlayers.filter(p => !p.isHost);

  // send roles to non-host players
  state.players.forEach(p => {
    if (!p.isHost) {
      sendToPlayer(p.id, { type: 'game_start', myRole: roles[p.id], players: clientPlayers });
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
    showScreen('screen-waiting');
    document.getElementById('waiting-message').textContent = 'Game starting… waiting for players to acknowledge their roles…';
    checkAllRoleAcks();
  }
}

function handleGameStart(data) {
  state.role         = data.myRole;
  state.players      = data.players;
  state.gameStatus   = 'role_reveal';
  state.currentRound = 1;
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
    desc.innerHTML    = 'You are innocent. Work with the other players to identify the murderer.<br><br>After each murder, check the <strong>witness testimony</strong> for clues, then provide your alibi and cast your vote. If the murderer appears in the group\'s <strong>top suspects</strong>, you win!<br><br><em>Observe every clue carefully.</em>';
  }
}

function acknowledgeRole() {
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
  // observer host is auto-acked; only wait for players who are in the game
  const playersToCheck = state.hostPlaying ? state.players : state.players.filter(p => !p.isHost);
  if (playersToCheck.every(p => state.roleAcks[p.id])) {
    beginMurdererTurn();
  }
}

function beginMurdererTurn() {
  if (!state.isHost) return;
  state.gameStatus = 'murderer_turn';

  if (state.murdererPlayerId === state.playerId) {
    showMurdererTurnScreen(state.currentRound);
  } else {
    sendToPlayer(state.murdererPlayerId, { type: 'your_murder_turn', round: state.currentRound });
    broadcastToAll(
      { type: 'wait_for_murder', message: 'The murderer is planning their next move…' },
      state.murdererPlayerId
    );
    showScreen('screen-waiting');
    document.getElementById('waiting-message').textContent = 'The murderer is planning their next move…';
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
  const victim = state.players.find(p => p.id === data.victimId);
  if (!victim) return;

  victim.isAlive = false;
  const location    = randomFrom(LOCATIONS);
  const dumpLocation = randomFrom(DUMP_LOCATIONS);
  const methodLabel = (METHODS.find(m => m.id === data.method) || {}).label || data.method;
  const witnessClue = generateWitnessClue(dumpLocation);

  const murder = {
    round:        data.round,
    victimId:     data.victimId,
    victimName:   victim.name,
    method:       methodLabel,
    location:     location,
    supplies:     data.supplies || [],
    dumpLocation: dumpLocation,
    witnessClue:  witnessClue,
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
  showScreen('screen-crime-scene');
  const { murder, alivePlayers } = data;

  document.getElementById('crime-details').innerHTML =
    `<div class="victim-name">${escapeHtml(murder.victimName)}</div>
     <div class="crime-description">was found dead in <strong>${escapeHtml(murder.location)}</strong></div>
     <div class="crime-method">Cause of death: <strong>${escapeHtml(murder.method)}</strong></div>
     <div class="crime-round">Round ${escapeHtml(String(murder.round))}</div>`;

  const supDiv = document.getElementById('crime-supplies');
  if (murder.supplies && murder.supplies.length > 0) {
    supDiv.innerHTML = murder.supplies.map(s =>
      `<div class="evidence-item">🔍 ${escapeHtml(s.name)} ($${s.cost}) — ${escapeHtml(s.desc)}</div>`
    ).join('');
  } else {
    supDiv.innerHTML = '<div class="evidence-item">No items found at the scene.</div>';
  }

  const witnessEl = document.getElementById('witness-testimony');
  if (witnessEl && murder.witnessClue) {
    witnessEl.textContent = murder.witnessClue;
    document.getElementById('witness-box').style.display = 'block';
  } else if (document.getElementById('witness-box')) {
    document.getElementById('witness-box').style.display = 'none';
  }

  document.getElementById('still-alive').innerHTML =
    alivePlayers.map(p => `<div class="player-tag">${escapeHtml(p.name)}</div>`).join('');

  const proceedBtn   = document.getElementById('btn-proceed-vote');
  const waitingLabel = document.getElementById('crime-scene-status');

  if (state.isHost) {
    proceedBtn.style.display   = 'block';
    waitingLabel.style.display = 'none';
  } else {
    proceedBtn.style.display   = 'none';
    waitingLabel.style.display = 'block';
  }
}

function hostProceedToVoting() {
  if (!state.isHost) return;

  // observer host doesn't count as an innocent
  const aliveInnocents = state.players.filter(p =>
    p.isAlive && p.id !== state.murdererPlayerId && (state.hostPlaying || !p.isHost)
  );
  if (aliveInnocents.length === 0) {
    endGame('murderer');
    return;
  }

  state.gameStatus = 'investigation';
  // alive voting players (excludes observer host)
  const alive = publicPlayerList()
    .filter(p => p.isAlive && (state.hostPlaying || !p.isHost));
  const msg = { type: 'start_voting', alivePlayers: alive, round: state.currentRound, totalVoters: alive.length };
  broadcastToAll(msg);
  handleStartVoting(msg);
}

function handleStartVoting(data) {
  // observer host gets a read-only watch screen during voting
  if (state.isHost && !state.hostPlaying) {
    const total = data.totalVoters || data.alivePlayers.length;
    showScreen('screen-waiting');
    document.getElementById('waiting-message').textContent = `Investigation in progress… 0 / ${total} votes received.`;
    return;
  }

  showScreen('screen-investigation');
  state.myVote = null;
  const total = data.totalVoters || data.alivePlayers.length;
  document.getElementById('vote-status').textContent = `Waiting for votes (0 / ${total})…`;

  const div = document.getElementById('vote-options');
  div.innerHTML = '';
  data.alivePlayers.filter(p => p.id !== state.playerId).forEach(p => {
    const el = document.createElement('div');
    el.className   = 'option-item';
    el.dataset.id  = p.id;
    el.textContent = p.name;
    el.onclick     = () => selectVote(p.id, el);
    div.appendChild(el);
  });

  const alibiInput = document.getElementById('input-alibi');
  if (alibiInput) alibiInput.value = '';

  document.getElementById('btn-vote').disabled = true;
}

function selectVote(id, el) {
  state.myVote = id;
  document.querySelectorAll('#vote-options .option-item').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('btn-vote').disabled = false;
}

function submitVote() {
  if (!state.myVote) return;
  document.getElementById('btn-vote').disabled = true;
  document.getElementById('vote-status').textContent = 'Vote submitted! Waiting for others…';

  const alibiEl = document.getElementById('input-alibi');
  const alibi   = alibiEl ? alibiEl.value.trim().slice(0, 150) : '';

  const msg = { type: 'vote_submitted', voterId: state.playerId, suspectId: state.myVote, round: state.currentRound, alibi };
  if (state.isHost) {
    recordVote(msg);
  } else {
    state.hostConn.send(msg);
  }
}

function recordVote(data) {
  if (!state.isHost) return;
  if (!state.votes[data.round]) state.votes[data.round] = {};
  state.votes[data.round][data.voterId] = data.suspectId;

  if (data.alibi !== undefined && data.alibi !== null) {
    if (!state.alibis[data.round]) state.alibis[data.round] = {};
    state.alibis[data.round][data.voterId] = data.alibi;
  }

  // observer host is not a voter — exclude from total
  const aliveTotal = state.players.filter(p => p.isAlive && (state.hostPlaying || !p.isHost)).length;
  const received   = Object.keys(state.votes[data.round]).length;

  broadcastToAll({ type: 'vote_update', received, total: aliveTotal });
  // update host's own display (waiting screen when observing, investigation screen when playing)
  if (!state.hostPlaying) {
    document.getElementById('waiting-message').textContent = `Investigation in progress… ${received} / ${aliveTotal} votes received.`;
  } else {
    document.getElementById('vote-status').textContent = `${received} / ${aliveTotal} votes received…`;
  }

  if (received >= aliveTotal) tallyVotes(data.round);
}

function tallyVotes(round) {
  if (!state.isHost) return;
  const roundVotes = state.votes[round] || {};
  const counts = {};
  Object.values(roundVotes).forEach(sid => { counts[sid] = (counts[sid] || 0) + 1; });

  const suspects = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUSPECTS)
    .map(([id, votes]) => ({ id, name: (state.players.find(p => p.id === id) || {}).name || 'Unknown', votes }));

  const caught = suspects.some(s => s.id === state.murdererPlayerId);
  const murdererName = (state.players.find(p => p.id === state.murdererPlayerId) || {}).name || 'Unknown';

  const roundAlibis = state.alibis[round] || {};
  const alibis = Object.entries(roundAlibis).map(([pid, text]) => ({
    playerId:   pid,
    playerName: (state.players.find(p => p.id === pid) || {}).name || 'Unknown',
    alibi:      text,
  }));

  const msg = { type: 'show_round_results', suspects, murdererCaught: caught, murdererName, round, alibis };
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
    verdict.innerHTML =
      `<div class="verdict escaped">
         ❌ The murderer is NOT among the top suspects.
         <div class="verdict-sub">The killer remains at large…</div>
       </div>`;
    if (state.isHost) {
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
  state.currentRound++;

  // Check win condition for murderer (observer host doesn't count as an innocent)
  const aliveInnocents = state.players.filter(p =>
    p.isAlive && p.id !== state.murdererPlayerId && (state.hostPlaying || !p.isHost)
  );
  if (aliveInnocents.length === 0) { endGame('murderer'); return; }

  broadcastToAll({ type: 'start_next_round', round: state.currentRound });
  beginMurdererTurn();
}

function endGame(winner) {
  if (!state.isHost) return;
  state.gameStatus = 'game_over';
  state.winner = winner;
  const murdererName = (state.players.find(p => p.id === state.murdererPlayerId) || {}).name || 'Unknown';
  const msg = { type: 'game_over', winner, murdererName, murders: state.murders };
  broadcastToAll(msg);
  handleGameOver(msg);
}

function handleGameOver(data) {
  state.gameStatus = 'game_over';
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
    (data.murders && data.murders.length > 0
      ? `<div class="murder-log">
           <h4>Murder Log</h4>
           ${data.murders.map(m =>
               `<div class="murder-log-item">Round ${escapeHtml(String(m.round))}: <strong>${escapeHtml(m.victimName)}</strong> — ${escapeHtml(m.method)} in ${escapeHtml(m.location)}</div>`
             ).join('')}
         </div>`
      : '');
}
