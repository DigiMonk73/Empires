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
- **Disconnects:** the server tells the room `{left, peer}`. The host then submits a command
  `{t:'aiTakeover', seat, level:'hard'}` that every peer applies at the same tick: that seat becomes an AI run by the
  host from then on (the original kept the player's civilization under computer control). If the host leaves, the
  game ends for everyone with a "host left" message and an autosave on each client (save/load of multiplayer games
  comes later).
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
- [ ] **M16.4 In game.** _Partly:_ `src/platform/netGame.ts` builds the session (host runs the computers); pausing
      is off in multiplayer (the menu and F3 don't pause — pause/speed as commands are still to do); a "Waiting for the
      other players…" banner, "Player N left" messages, an out-of-sync banner. _Left:_ pause/speed commands, chat UI. Session wiring (local seat, host runs AIs), speed/pause as commands, "Waiting for
      Player N…" overlay when a peer's packets are late, chat. e2e: two contexts play 1 minute, both select and
      move units, hashes equal.
- [ ] **M16.5 Disconnects.** `aiTakeover` command; host-left ending; reconnect within 30 s by room code (the
      server buffers the room's packets so a rejoining client can replay from tick 0 — or from a save the host
      sends; start with replay).
- [ ] **M16.6 Desync report**, latency-based delay, room list polish.
- [ ] **M16.7 StartOS.** README/instructions: multiplayer section (everyone opens the same address; the interface
      can be shared on the LAN or Tor). Version 1.1.0. Both `.s9pk`.
- [ ] **M16.8 Exit:** verify:full green; a 4-player game (2 humans in two headless browsers + 2 AIs) runs 30 game
      minutes with no desync; the user plays one game against a friend.

## Risks
- **Floating-point divergence between Chromium and WebKit** — already guarded: the sim is integer/fixed-step
  and `determinism.ts` checks Node, Chromium and WebKit agree on 100 seeds.
- **Slow peer** — everyone waits for the slowest; the "Waiting for…" overlay and the latency-based delay keep it
  bearable.
- **Packet loss** — WebSocket is TCP, so none; a reconnect is the only gap.
