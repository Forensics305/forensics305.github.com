# THIN LINES

A browser-based multiplayer social-deduction game. One player is secretly the
murderer; the rest are innocents trying to identify and vote them out before
everyone is eliminated.

## Running the game

No build step is required. The game is a static site (`index.html`, `app.js`,
`style.css`).

**Local play (same device / LAN)**

```bash
# Any static-file server works, e.g.:
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

**Internet play**

The game uses [PeerJS](https://peerjs.com/) for peer-to-peer connections.
By default it falls back to free public STUN servers, which is sufficient for
most home networks. For better NAT traversal across the public internet, deploy
the AWS infrastructure in `infrastructure/` (SAM-based KVS ICE config Lambda)
and replace `ICE_CONFIG_URL` in `app.js` with the deployed API Gateway URL.

## How to play

1. **Host** opens the page, enters their name, and clicks **Create Room**.
2. Share the room code (or the generated invite link / QR code) with friends.
3. Each friend opens the page, clicks **Join a Room**, enters the code and their
   name.
4. Once 3+ players have joined, the host clicks **Start Game**.
5. Roles are revealed privately. The murderer plans their crime; innocents
   investigate, provide alibis, and vote to execute the suspect.
6. The game ends when the murderer is caught or all innocents are eliminated.

## Testing / validation checklist

| Flow | How to verify |
|---|---|
| Create room | Enter name → Create Room → host lobby appears with room code + QR |
| Copy invite link | Click 🔗 Copy Link → paste in new tab → join-name screen pre-fills |
| Join room (code) | Enter code → Join → join-name screen appears |
| Back buttons | Back from join / join-name / host lobby each return to correct previous screen |
| Kick player | Host lobby → Kick button removes the player |
| Start game (min 3) | Button disabled below 3 qualifying players |
| Role reveal timer | 15-second countdown auto-acknowledges if not clicked |
| Murderer turn | Choose victim + method → Commit Murder; budget updates; Fake ID shows frame-target picker |
| Crime scene | Evidence, forensic traces, witness testimony, and shooting/hospital notes display correctly |
| Alibi phase | Submit alibi (with optional partner); auto-submits on timer expiry |
| Discussion phase | Timer counts down; Vote to Skip button works; host Force Start Vote button works |
| **Forensic comparison** | Investigation screen: pick 2 suspects → Compare Evidence → DNA / fingerprint / palm-print profiles shown alongside scene evidence |
| Vote | Select a player → Submit Vote; auto-submits on expiry |
| Round results | Top suspects, alibis, and verdict shown; host Continue button triggers next round |
| Observer mode | Uncheck "Join as a player" → host sees board view instead of role/murder/alibi screens |
| Game over | Play Again reloads to profile screen |
| localStorage name | Reloading the page pre-fills the last-used player name |
| Session rejoin | Refreshing mid-game reconnects the player automatically |

## Repaired user-facing flows (this PR)

| # | Bug | Fix |
|---|---|---|
| 1 | **Forensic comparison panel empty during vote phase** — `hostStartVote` did not include `forensicProfiles` or `sceneForensics` in the `start_vote` network message, so all clients saw "No scene forensic evidence available" and empty suspect profiles. | Added `forensicProfiles` and `sceneForensics` fields to the `start_vote` message in `hostStartVote`. |
| 2 | **`handleVotePhase` ignored locally-cached profiles** — `state.voteForensicProfiles` was initialised from `data.forensicProfiles \|\| {}`, discarding the profiles already stored in `state.forensicProfiles` from game-start. | Changed initialisation to `data.forensicProfiles \|\| state.forensicProfiles \|\| {}` so the local cache is used as a fallback. |
| 3 | **`handleStartVoting` was unreachable dead code** — its forensic-profile sync logic was bypassed because both `start_vote` and `start_voting` message cases called `handleVotePhase` directly. | Re-routed both cases through `handleStartVoting`, which updates `state.forensicProfiles` then calls `handleVotePhase`. |
| 4 | **Discussion-timer expire callback fired `hostStartVote` on every client** — while the `!state.isHost` guard inside `hostStartVote` prevented incorrect state changes, the extra call caused unnecessary re-entrancy and could race with the authoritative host-side `setHostTimer` callback. | Added an `state.isHost` check to the `startCountdown` expire callback in `handleDiscussion` so only the host advances the game when the visual timer hits zero. |

## Features not repaired (behavior not inferable)

- **ICE/TURN server integration** — `ICE_CONFIG_URL` is a placeholder (`https://YOUR_API_GATEWAY_URL/ice-config`); the game gracefully falls back to public STUN servers, which works on most LANs but may fail across strict NATs. The infrastructure is provided in `infrastructure/` but requires a separate AWS deployment.

---

## Dev log (original)

THINLINES.LIVE BETA 0.6 — discussion timer fix + other bug fixes  
THINLINES.LIVE BETA 0.5 — URL-based sessions, access code removed, back button  
THINLINES.LIVE BETA 0.4 — skip-discussion voting  
THINLINES.LIVE BETA 0.3 — firearms mechanic (shooting with probabilistic outcomes)  
THINLINES.LIVE BETA 0.2 — forensic science elements  
THINLINES.LIVE BETA 0.1 — base game
