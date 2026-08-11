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

## Host sharing features

- **Join QR code** — the host lobby generates the join QR code entirely in the
  browser from the current `#join/ROOMCODE` invite URL. The QR payload is never
  sent to an external QR-generation service.
- **Pinned QR dependency** — QR rendering uses the maintained
  [`qrcode@1.5.4`](https://www.npmjs.com/package/qrcode) browser build. The page
  loads that pinned version from a CDN and falls back to a second pinned CDN if
  the primary one is unavailable.
- **Google Classroom posting** — the host can optionally sign in with Google,
  list only Classroom courses where they are a teacher, review an editable
  announcement containing the join link, and explicitly confirm the final post.
  Access tokens stay in memory for the current tab only and are never stored in
  `localStorage`, repository files, query strings, or logs.

## Google Classroom setup

Google Classroom posting requires one-time OAuth configuration outside this
repository. Only a teacher who is authorized in the target Google Classroom can
post announcements.

1. In Google Cloud, create or choose a project for this site.
2. Enable the **Google Classroom API** for that project.
3. Configure the **OAuth consent screen**:
   - Choose the appropriate user type for your deployment.
   - Add your test users while the app is in testing, if applicable.
   - List only the scopes this site uses:
     - `https://www.googleapis.com/auth/classroom.courses.readonly`
     - `https://www.googleapis.com/auth/classroom.announcements`
4. Create an **OAuth 2.0 Client ID** for a **Web application**.
5. Add your deployed GitHub Pages origin to **Authorized JavaScript origins**
   (for example `https://forensics305.github.io` or your custom domain origin).
6. Copy the public client ID into the placeholder meta tag in `index.html`:

   ```html
   <meta name="thin-lines-google-client-id" content="YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com" />
   ```

   You may also set `window.THIN_LINES_PUBLIC_CONFIG = { googleClientId: '...' }`
   before `app.js` loads if you prefer a non-secret runtime override.
7. Do **not** create or commit a client secret for this static site.
8. Re-deploy the site.

This app uses the Google Identity Services **token flow** that is appropriate
for a static GitHub Pages deployment. No refresh token or client secret is used
or stored by the site.

## Testing / validation checklist

| Flow | How to verify |
|---|---|
| Create room | Enter name → Create Room → host lobby appears with room code + QR |
| Copy invite link | Click 🔗 Copy Join Link → paste in new tab → join-name screen pre-fills |
| Download QR | Host lobby → Download PNG / Download SVG both save a scannable QR for the current room |
| Scan QR | Scan the host QR with a phone camera → open the join URL → join-name screen pre-fills |
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

## Manual checklist: Google Classroom host flow

- [ ] Open the host lobby and confirm the Join QR code, join link field, and PNG/SVG download buttons update for the active room.
- [ ] Paste the copied join link directly into a new tab and confirm the join flow still lands on the join-name screen for that room.
- [ ] Click **Connect Classroom** with popup blocking enabled and confirm the UI reports the popup-blocked failure clearly.
- [ ] Start Google sign-in and cancel/close it; confirm the UI reports that authorization was cancelled and nothing was posted.
- [ ] Sign in with a teacher account that has at least one active Classroom course; confirm only teacher courses are listed.
- [ ] Edit the prefilled announcement text, choose a course, click **Review Announcement**, and confirm nothing is posted until **Post Announcement** is clicked.
- [ ] Click **Post Announcement** and confirm the success message appears after the Classroom API call completes.
- [ ] Test common failure paths: missing client ID, expired token (reload or wait for expiry), insufficient Classroom permissions, and a non-teacher/no-course account.

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
