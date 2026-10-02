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
- **Disconnects (as built, M16.5):** a dropped member keeps its seat for the hold (`--away-ms`, 30 s) and may
  rejoin with its token; after that the server tells the room `{left, peer}`. The relay has delivered everything
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
      computers, if the host left). A page reload rejoins within the hold (`--away-ms`, 30 s). Tests:
      `lockstep.test.ts` "a peer leaving", e2e "a player who closes the game". _Left:_ a guest who reloads after the
      hold can't come back; desync reports (M16.6).
- [ ] **M16.5b Late rejoin.** A guest back after the hold: the server keeps the room's packets so the client can
      replay from tick 0 (or the authority sends a save), then the computer hands the seat back.
- [ ] **M16.6 Desync report**, latency-based delay, room list polish.
- [ ] **M16.7 StartOS.** README/instructions: multiplayer section (everyone opens the same address; the interface
      can be shared on the LAN or Tor). Version 1.1.0. Both `.s9pk`.
- _Soak (`node tools/sim/net-soak.ts [minutes] [humans] [computers] [seed]`, real server, Node clients, fuzzed
  orders): 2 + 2 for 30 min, 4 + 4 for 60 min, 3 + 1 for 30 min — every checkpoint equal, no desync (2026-10-02)._
- [ ] **M16.8 Exit:** verify:full green; a 4-player game (2 humans in two headless browsers + 2 AIs) runs 30 game
      minutes with no desync; the user plays one game against a friend.

## Risks
- **Floating-point divergence between Chromium and WebKit** — already guarded: the sim is integer/fixed-step
  and `determinism.ts` checks Node, Chromium and WebKit agree on 100 seeds.
- **Slow peer** — everyone waits for the slowest; the "Waiting for…" overlay and the latency-based delay keep it
  bearable.
- **Packet loss** — WebSocket is TCP, so none; a reconnect is the only gap.
