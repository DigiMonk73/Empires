# MULTIPLAYER — the M16 plan

_Branch `m16-multiplayer`. Each step is a commit with `npm run verify` green; tick a box with its commit. Locked
decisions: multiplayer goes through the StartOS server (PLAN.md "Locked decisions"), the simulation is lockstep
(D10). Read `docs/HANDOFF.md` first._

## What already exists (M15.2)
- `src/game/lockstep.ts` — `LockstepRouter`: a command given at tick t is scheduled for t + `delay`, every peer
  sends one packet per tick (empty too), a tick runs only when every peer's packet is in, commands apply in peer
  order, and packets carry state hashes every `checkEvery` ticks (`desync` is set on a mismatch).
- `src/game/loopback.ts` — `LoopbackNetwork`: an in-process network with latency and jitter (tests).
- `src/sim/commands/codec.ts` — every command encodes to bytes; `encodeCommands` / `decodeCommands`.
- `src/game/session.ts` — `GameSession(config, localPlayer, router, { ais })`: `ais` names the AI seats this
  session runs (in multiplayer only the host runs them; their commands go through the router like a human's).
- `tests/unit/lockstep.test.ts` — two sessions over the loopback network with jitter stay in sync to the hash.

## Design
- **Topology:** star through the server. `server/serve.mjs` gains a WebSocket endpoint `/ws` (hand-written
  RFC 6455 framing — the server has no npm dependencies and should keep none). The server is a dumb relay plus a
  lobby: it never runs the simulation.
- **Rooms:** a host creates a room (4-letter code), sets up the skirmish (the normal setup screen, with each seat
  Human / Computer / Open), others join by code or from a room list. The host starts; the server sends every
  member `{start, setup, seed, seats, peerIndex, delay}`; every client builds the same `SimConfig` from `setup`
  (`skirmishConfig`) and its own `GameSession(config, mySeat, new LockstepRouter({peer, peers, delay,
  transport}), { ais: host ? aiSeats : [] })`.
- **Peers vs seats:** peers are the connected clients (0 = host); seats are game players. A peer controls exactly
  one seat; the host also submits the AI seats' commands.
- **Wire format:** binary frames. Lobby messages are JSON text frames. Game packets are binary:
  `[u8 kind=1][u16 from][u32 tick][u8 hasCheck][u32 checkTick][u32 hash][cmd bytes…]`. The server forwards a
  peer's packet to every other peer in the room unchanged.
- **Delay:** start with 4 ticks (200 ms at 20 Hz); measure RTT in the lobby (ping/pong) and set
  `delay = clamp(ceil(maxRTT / 50 ms) + 2, 4, 12)`.
- **Speed and pause:** both become commands (`{t:'speed'}` / `{t:'pause'}`) so every peer applies them at the
  same tick. The host's choice wins; any player may pause (as the original).
- **Disconnects (as built, M16.5/5b):** a member whose connection drops keeps its seat for the hold (`--away-ms`,
  30 s; every page drops once, loading the game after the start) and rejoins with its token — replaying the room's
  log if it had played; Quit, or the hold running out, sends `{left, peer}` to the room. The relay has delivered everything
  that peer sent first, so every survivor calls `router.drop(peer)` and stops waiting after the same tick. The
  lowest-numbered remaining peer runs a computer for the seat (and every computer seat, if the host left); its
  commands travel in that peer's packets.
- **Desync:** on `router.desync` show "Out of sync at tick N" with a button that saves a desync report (both
  hashes, the command log since the last check) to the server under `/data/desync/`.
- **Chat:** text frames relayed by the server, shown in the messages area; Enter opens the chat box.
- **Fog and cheating:** every client runs the full simulation (lockstep), so fog is client-side; acceptable for
  friends on one StartOS server.

## Steps
- [x] **M16.1 WebSocket relay.** _Done:_ `server/relay.mjs` (+ `--away-ms`); `tests/unit/server-ws.test.ts`. `/ws` upgrade in `server/serve.mjs`: handshake, text + binary frames, ping/pong,
      close; rooms (create, join, list, leave, start), relay of binary frames within a room. Unit test with Node's
      built-in `WebSocket` client against a real server (`tests/unit/server-ws.test.ts`).
- [x] **M16.2 Client transport.** _Done:_ `src/game/netPacket.ts`, `src/platform/netClient.ts` (lobby + transport
      + rejoin); `tests/unit/net-session.test.ts` runs two sessions through the real server, hash-identical. `src/platform/wsTransport.ts`: implements `LockstepTransport` over a WebSocket
      (packet encode/decode as above), plus the lobby messages. Test: two `GameSession`s on two transports through
      the real server for 2 game minutes, hashes equal.
- [x] **M16.3 Lobby UI.** _Done:_ `src/ui/menu/Multiplayer.tsx` (name → rooms → host/join), the Skirmish setup's
      multiplayer mode (Human seats named by members, Start when every seat is filled), guests' read-only room. The
      host's start saves each member's seat (`sessionStorage` `empires.mp`) and loads `?mp=1`; the game page
      rejoins with its token (the server holds a reloading member's seat 30 s and buffers its packets).
      e2e `tests/e2e/multiplayer.spec.ts` (both engines). Main menu → **Multiplayer**: Host (the skirmish setup with seats Human/Computer/Open and
      a room code) or Join (code or list). Players see the seats fill; the host starts when every Human seat is
      taken. e2e: two browser contexts host + join and both reach the game.
- [x] **M16.4 In game.** _Done:_ `src/platform/netGame.ts` builds the session (host runs the computers); F3 pauses
      and resumes everyone (a relayed `{t:'pause'}` — pausing changes no game state, so no command is needed); the
      menu and dialogs don't pause; speed is the host's setup speed; Enter opens a chat box (lines show as messages);
      banners for "Waiting for the other players…", "Paused by …" and out of sync. e2e covers pause and chat.
- [x] **M16.5 Disconnects** (the part that keeps a game alive). _Done:_ `LockstepRouter.drop(peer)` — the relay
      delivers everything a peer sent before announcing it left, so every survivor stops waiting after the same
      tick; `takeOver()` in `netGame.ts` gives the seat to a computer run by the lowest remaining peer (all the
      computers, if the host left). A dropped member's seat is held (`--away-ms`, 30 s) while the others wait; Quit
      sends `{t:'leave'}` and goes at once. The in-game menu has no speed, Save, Load or Restart in multiplayer.
      Tests: `lockstep.test.ts` "a peer leaving", `server-ws.test.ts`, e2e "closes the game".
- [x] **M16.5b Rejoin mid-game.** _Done:_ the server keeps each room's packets from the start (`room.log`, up to 2M);
      a member back within the hold that had played gets `{t:'rejoined', replay:true}` and the whole log. Its page
      replays from tick 0 at full speed, muted (`LockstepRouter.replaying` takes its own old packets from the log
      and neither re-seals nor re-sends those ticks — what its computers re-decide meanwhile is dropped), and goes
      live at the first tick the log lacks; the others resume. Tests: `net-session.test.ts` "rejoining a game in
      progress", `server-ws.test.ts`, e2e "reloads mid-game" (both engines).
- [x] **M16.6 Desync report, latency-based delay.** _Done:_ each member measures its round trip to the server
      (median of 3 pings, `NetClient.reportRtt`) and the members list carries it; the host's start sets the input
      delay with `delayFor` (2 + worst round trip in 50 ms ticks, 4–12: 200 ms on a LAN, up to 600 ms over Tor). A
      desync posts a report (tick, both hashes, the game) to `POST /api/desync` → `DATA_DIR/desync/` (newest 50).
      _Left:_ room list polish (a room's members' pings shown).
- [x] **M16.7 StartOS.** _Done:_ version 1.1.0; the package's instructions and README cover multiplayer (branch
      `m16-multiplayer` in `../empires-startos`, cc8b265 — with M16.5b); verify:full green (660 unit + 168 e2e, AI
      suite, determinism ×3, soaks, Docker both arches, Tauri, make arm); both `.s9pk` 1.1.0:0 built — **not
      installed on the VM** (the user's call).
- [ ] **M16.8 Exit:** verify:full green; a 4-player game (2 humans in two headless browsers + 2 AIs) runs 30 game
      minutes with no desync; the user plays one game against a friend.

## Risks
- **Floating-point divergence between Chromium and WebKit** — already guarded: the sim is integer/fixed-step
  and `determinism.ts` checks Node, Chromium and WebKit agree on 100 seeds.
- **Slow peer** — everyone waits for the slowest; the "Waiting for…" overlay and the latency-based delay keep it
  bearable.
- **Packet loss** — WebSocket is TCP, so none; a reconnect is the only gap.
