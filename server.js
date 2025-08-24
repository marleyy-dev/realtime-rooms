import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store (simple on purpose)
const rooms = new Map(); // roomName -> { users: Map(socketId -> {name}), history: [{name,text,time}] }
const MAX_HISTORY = 100;

// Helper to ensure room exists
function ensureRoom(room) {
  if (!rooms.has(room)) {
    rooms.set(room, { users: new Map(), history: [] });
  }
  return rooms.get(room);
}

// API to get room info (so links like /?room=general work)
app.get('/api/room/:room', (req, res) => {
  const { room } = req.params;
  const r = rooms.get(room);
  res.json({
    room,
    online: r ? r.users.size : 0
  });
});

// Socket.IO real-time events
io.on('connection', (socket) => {
  // Client announces join with name + room
  socket.on('join', ({ name, room }) => {
    const cleanName = String(name || 'Guest').slice(0, 24).trim() || 'Guest';
    const cleanRoom = String(room || 'general').slice(0, 32).trim().toLowerCase() || 'general';

    socket.data.name = cleanName;
    socket.data.room = cleanRoom;

    const r = ensureRoom(cleanRoom);
    r.users.set(socket.id, { name: cleanName });

    socket.join(cleanRoom);

    // Send existing history to the newly joined user
    socket.emit('history', r.history);

    // Broadcast join
    io.to(cleanRoom).emit('system', {
      type: 'join',
      text: `${cleanName} joined`,
      online: r.users.size,
      time: Date.now()
    });
  });

  // Incoming message
  socket.on('message', (text) => {
    const name = socket.data.name || 'Guest';
    const room = socket.data.room || 'general';
    const r = ensureRoom(room);

    const msg = {
      name,
      text: String(text || '').slice(0, 500),
      time: Date.now()
    };
    if (!msg.text) return;

    // Save to history (trim)
    r.history.push(msg);
    if (r.history.length > MAX_HISTORY) r.history.shift();

    // Broadcast to room
    io.to(room).emit('message', msg);
  });

  // Typing indicator (optional, lightweight)
  socket.on('typing', (isTyping) => {
    const name = socket.data.name || 'Guest';
    const room = socket.data.room || 'general';
    socket.to(room).emit('typing', { name, isTyping: Boolean(isTyping) });
  });

  // Leaving / disconnect
  socket.on('disconnect', () => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (!room) return;

    const r = rooms.get(room);
    if (!r) return;

    r.users.delete(socket.id);

    io.to(room).emit('system', {
      type: 'leave',
      text: `${name || 'Guest'} left`,
      online: r.users.size,
      time: Date.now()
    });

    // If room becomes empty, we can optionally clear it:
    // if (r.users.size === 0) rooms.delete(room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
