// Empires multiplayer relay (M16.1, docs/MULTIPLAYER.md): a zero-dependency WebSocket endpoint (RFC 6455) with
// rooms. The server never runs the game: clients run the lockstep simulation and the server only forwards their
// packets within a room, plus a small JSON lobby protocol.
//
// Text frames (JSON), client → server:
//   {t:'hello', name}                    → {t:'welcome', id}
//   {t:'list'}                           → {t:'rooms', rooms:[{code, host, members, max, started}]}
//   {t:'create', name, max?}             → {t:'room', code, you, host, members}     (you = your peer index)
//   {t:'join', code, name}               → {t:'room', …} to you, {t:'members', members} to the others
//   {t:'leave'}
//   {t:'setup', setup}       host only   → {t:'setup', setup} to the others
//   {t:'start', game}        host only   → {t:'start', game, you, peers} to everyone (peer indices fixed from here)
//   {t:'chat', text}                     → {t:'chat', from, name, text} to everyone
//   {t:'pause', on}                      → {t:'pause', on, from, name} to everyone (a started game; anyone may)
//   {t:'ping', at}                       → {t:'pong', at}
//   {t:'rejoin', code, peer, token}      → {t:'rejoined', you, peers, game, replay} — back into a started game within
//                                          AWAY_MS of dropping (the game page after the lobby, a reload, a blip). Then
//                                          come the packets it missed — or, if it had played, the room's whole log to
//                                          replay from tick 0. `token` comes in your {t:'room'}.
// Server → clients also: {t:'left', peer} (a member left a started game), {t:'closed', why} (the host left before
// the start), {t:'error', error}.
// Binary frames: game packets. In a started room each one goes unchanged to every other member.
import { createHash, randomBytes, randomInt } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1 << 20; // 1 MiB
const PING_MS = 15_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
const MAX_MEMBERS = 8;
/** A member of a started game who drops is held this long before the others hear {t:'left'} (a page load). */
const AWAY_MS = 30_000;
const MAX_BUFFERED = 50_000;
/** Game packets kept per room so a member back from a drop can replay the game from the start (M16.5b). */
const MAX_LOG = 2_000_000;

/** Attach the relay to an `http.Server`: upgrades on `path` become WebSocket clients. */
export function attachRelay(server, { path = '/ws', log = () => {}, awayMs = AWAY_MS } = {}) {
  const rooms = new Map(); // code → { code, max, started, members: Client[], setup }
  let nextId = 1;

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const key = req.headers['sec-websocket-key'];
    if (url.pathname !== path || (req.headers.upgrade ?? '').toLowerCase() !== 'websocket' || !key) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    const client = new Client(socket, nextId++);
    client.onText = (text) => lobby(client, text);
    client.onBinary = (data) => relay(client, data);
    client.onClose = () => leave(client);
  });

  function sendJson(c, msg) {
    c.sendText(JSON.stringify(msg));
  }

  function membersOf(room) {
    return room.members.map((m, i) => ({ peer: i, name: m.name, id: m.id }));
  }

  function lobby(c, text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return sendJson(c, { t: 'error', error: 'not JSON' });
    }
    const room = c.room;
    switch (m.t) {
      case 'hello':
        c.name = String(m.name ?? '').slice(0, 24) || `Player ${c.id}`;
        return sendJson(c, { t: 'welcome', id: c.id });
      case 'ping':
        return sendJson(c, { t: 'pong', at: m.at });
      case 'list':
        return sendJson(c, {
          t: 'rooms',
          rooms: [...rooms.values()].map((r) => ({ code: r.code, host: r.members[0]?.name ?? '', members: r.members.length, max: r.max, started: r.started })),
        });
      case 'create': {
        if (room) leave(c);
        if (m.name) c.name = String(m.name).slice(0, 24);
        let code;
        do code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
        while (rooms.has(code));
        const r = { code, max: Math.min(MAX_MEMBERS, Math.max(2, Number(m.max) || MAX_MEMBERS)), started: false, members: [c], setup: null, game: null };
        rooms.set(code, r);
        c.room = r;
        c.token = randomBytes(12).toString('hex');
        log(`room ${code} created by ${c.name}`);
        return sendJson(c, { t: 'room', code, you: 0, host: 0, members: membersOf(r), token: c.token });
      }
      case 'join': {
        const r = rooms.get(String(m.code ?? '').toUpperCase());
        if (!r) return sendJson(c, { t: 'error', error: 'no such room' });
        if (r.started) return sendJson(c, { t: 'error', error: 'that game has started' });
        if (r.members.length >= r.max) return sendJson(c, { t: 'error', error: 'that room is full' });
        if (room) leave(c);
        if (m.name) c.name = String(m.name).slice(0, 24);
        r.members.push(c);
        c.room = r;
        c.token = randomBytes(12).toString('hex');
        sendJson(c, { t: 'room', code: r.code, you: r.members.length - 1, host: 0, members: membersOf(r), token: c.token, ...(r.setup ? { setup: r.setup } : {}) });
        for (const o of r.members) if (o !== c) sendJson(o, { t: 'members', members: membersOf(r) });
        return;
      }
      case 'leave':
        return leave(c);
      case 'setup':
        if (!room || room.members[0] !== c || room.started) return sendJson(c, { t: 'error', error: 'only the host sets up the game' });
        room.setup = m.setup ?? null;
        for (const o of room.members) if (o !== c) sendJson(o, { t: 'setup', setup: room.setup });
        return;
      case 'start':
        if (!room || room.members[0] !== c || room.started) return sendJson(c, { t: 'error', error: 'only the host starts the game' });
        room.started = true;
        room.game = m.game ?? null;
        room.log = [];
        log(`room ${room.code} started with ${room.members.length}`);
        room.members.forEach((o, i) => sendJson(o, { t: 'start', game: m.game ?? null, you: i, peers: room.members.length }));
        return;
      case 'rejoin': {
        const r = rooms.get(String(m.code ?? '').toUpperCase());
        const peer = Number(m.peer);
        const old = r?.started ? r.members[peer] : undefined;
        if (!old || !old.away || !old.token || old.token !== m.token) return sendJson(c, { t: 'error', error: 'cannot rejoin that game' });
        clearTimeout(old.awayTimer);
        if (room) leave(c);
        c.name = old.name;
        c.token = old.token;
        c.room = r;
        r.members[peer] = c;
        c.sent = old.sent;
        // Before it played: the packets that waited. After: everything since the start, to replay the game.
        const replay = old.sent;
        sendJson(c, { t: 'rejoined', code: r.code, you: peer, peers: r.members.length, game: r.game, replay });
        for (const data of replay ? r.log : old.buffer) c.sendBinary(data);
        log(`room ${r.code}: peer ${peer} back (${replay ? `replaying ${r.log.length}` : `${old.buffer.length} waited`} packets)`);
        return;
      }
      case 'pause': {
        if (!room || !room.started) return;
        const out = { t: 'pause', on: !!m.on, from: room.members.indexOf(c), name: c.name };
        for (const o of room.members) sendJson(o, out);
        return;
      }
      case 'chat': {
        if (!room) return;
        const from = room.members.indexOf(c);
        const out = { t: 'chat', from, name: c.name, text: String(m.text ?? '').slice(0, 300) };
        for (const o of room.members) sendJson(o, out);
        return;
      }
      default:
        return sendJson(c, { t: 'error', error: `unknown message ${String(m.t)}` });
    }
  }

  function relay(c, data) {
    const room = c.room;
    if (!room || !room.started) return;
    c.sent = true; // in the game now: a drop from here rejoins by replaying the room's log (see rejoin)
    if (room.log.length < MAX_LOG) room.log.push(Buffer.from(data));
    else room.logFull = true;
    for (const o of room.members) {
      if (o === c) continue;
      if (o.away) {
        if (o.buffer.length < MAX_BUFFERED) o.buffer.push(Buffer.from(data));
      } else if (!o.closed) o.sendBinary(data);
    }
  }

  function leave(c) {
    const room = c.room;
    if (!room) return;
    c.room = null;
    const peer = room.members.indexOf(c);
    if (room.started) {
      // Peer indices stay fixed in a running game. A member whose connection drops (a page load — every member's
      // page loads the game right after the start — a reload, a blip) is held `awayMs` while the others wait, and
      // rejoins with its token: before it played, the packets sent meanwhile are delivered; after, the room's whole
      // log, which its page replays from tick 0 (M16.5b). A member that says {t:'leave'} (Quit) goes at once; so
      // does one whose game outgrew the log. Then the others hear it left and a computer takes its seat.
      const gone = () => {
        room.members[peer] = { closed: true, sendText() {}, sendBinary() {}, name: c.name, id: c.id };
        const live = room.members.filter((o) => !o.closed && !o.away);
        for (const o of live) sendJson(o, { t: 'left', peer });
        if (!room.members.some((o) => !o.closed)) rooms.delete(room.code);
      };
      if (c.closed && c.token && awayMs > 0 && !room.logFull) {
        const held = { away: true, closed: false, buffer: [], sent: !!c.sent, token: c.token, name: c.name, id: c.id, sendText() {}, sendBinary() {} };
        held.awayTimer = setTimeout(() => room.members[peer] === held && gone(), awayMs);
        room.members[peer] = held; // (everyone is away a moment at the start: each page loads the game)
        return;
      }
      gone();
      return;
    }
    room.members.splice(peer, 1);
    if (peer === 0 || !room.members.length) {
      for (const o of room.members) {
        o.room = null;
        sendJson(o, { t: 'closed', why: 'the host left' });
      }
      rooms.delete(room.code);
      return;
    }
    for (const [i, o] of room.members.entries()) sendJson(o, { t: 'room', code: room.code, you: i, host: 0, members: membersOf(room), ...(room.setup ? { setup: room.setup } : {}) });
  }

  return { rooms };
}

/** One WebSocket connection: frame parsing (client frames are masked), fragmentation, ping/pong, close. */
class Client {
  constructor(socket, id) {
    this.socket = socket;
    this.id = id;
    this.name = `Player ${id}`;
    this.room = null;
    this.closed = false;
    this.buf = Buffer.alloc(0);
    this.frag = null; // { opcode, parts: Buffer[], size }
    this.alive = true;
    this.onText = () => {};
    this.onBinary = () => {};
    this.onClose = () => {};
    socket.on('data', (d) => this.data(d));
    socket.on('close', () => this.close());
    socket.on('error', () => this.close());
    this.timer = setInterval(() => {
      if (!this.alive) return this.close();
      this.alive = false;
      this.frame(0x9, Buffer.alloc(0));
    }, PING_MS);
  }

  data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.fail(1009);
        len = Number(big);
        off = 10;
      }
      if (!masked) return this.fail(1002); // clients must mask
      if (len > MAX_MESSAGE) return this.fail(1009);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      this.alive = true;
      if (opcode === 0x8) return this.close(true);
      if (opcode === 0x9) {
        this.frame(0xa, payload);
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x0) {
        if (!this.frag) return this.fail(1002);
        this.frag.parts.push(payload);
        this.frag.size += payload.length;
        if (this.frag.size > MAX_MESSAGE) return this.fail(1009);
        if (fin) {
          const { opcode: op, parts } = this.frag;
          this.frag = null;
          this.message(op, Buffer.concat(parts));
        }
        continue;
      }
      if (opcode !== 0x1 && opcode !== 0x2) return this.fail(1002);
      if (!fin) {
        this.frag = { opcode, parts: [payload], size: payload.length };
        continue;
      }
      this.message(opcode, payload);
    }
  }

  message(opcode, payload) {
    if (this.closed) return;
    if (opcode === 0x1) this.onText(payload.toString('utf8'));
    else this.onBinary(payload);
  }

  frame(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    if (len >= 126) {
      head[0] = 0x80 | opcode;
      if (len < 65536) {
        head[1] = 126;
        head.writeUInt16BE(len, 2);
      } else {
        head[1] = 127;
        head.writeBigUInt64BE(BigInt(len), 2);
      }
    }
    this.socket.write(Buffer.concat([head, payload]));
  }

  sendText(text) {
    this.frame(0x1, Buffer.from(text, 'utf8'));
  }

  sendBinary(data) {
    this.frame(0x2, Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  fail(code) {
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code, 0);
    this.frame(0x8, p);
    this.close();
  }

  close(reply = false) {
    if (this.closed) return;
    if (reply) this.frame(0x8, Buffer.alloc(0));
    this.closed = true;
    clearInterval(this.timer);
    this.socket.end();
    this.onClose();
  }
}
