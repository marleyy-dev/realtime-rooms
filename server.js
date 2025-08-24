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

// In-memory store
// roomName -> { users: Map(socketId -> {name, pic}), history: [...] }
const rooms = new Map();
const MAX_HISTORY = 100;

function ensureRoom(room) {
  if (!rooms.has(room)) {
    rooms.set(room, { users: new Map(), history: [] });
  }
  return rooms.get(room);
}

// --- API for room info ---
app.get('/api/room/:room', (req, res) => {
  const { room } = req.params;
  const r = rooms.get(room);
  res.json({
    room,
    online: r ? r.users.size : 0
  });
});

// --- Socket.IO events ---
io.on('connection', (socket) => {
  // Client joins with name, room, (optionally pic)
  socket.on('join', ({ name, room, pic }) => {
    const cleanName = String(name || 'Guest').slice(0, 24).trim() || 'Guest';
    const cleanRoom = String(room || 'general').slice(0, 32).trim().toLowerCase() || 'general';

    socket.data.name = cleanName;
    socket.data.room = cleanRoom;
    socket.data.pic = pic || null;

    const r = ensureRoom(cleanRoom);
    r.users.set(socket.id, { name: cleanName, pic: socket.data.pic });

    socket.join(cleanRoom);

    // Send existing history
    socket.emit('history', r.history);

    // Broadcast join
    io.to(cleanRoom).emit('system', {
      type: 'join',
      text: `${cleanName} joined`,
      online: r.users.size,
      time: Date.now()
    });

    // Send updated room list to everyone
    broadcastRooms();
  });

  // Update profile picture
  socket.on('setProfilePic', (picUrl) => {
    socket.data.pic = picUrl;
    const r = ensureRoom(socket.data.room);
    if (r.users.has(socket.id)) {
      r.users.set(socket.id, { name: socket.data.name, pic: picUrl });
    }
    broadcastRooms();
  });

  // Incoming message
  socket.on('message', (text) => {
    const name = socket.data.name || 'Guest';
    const room = socket.data.room || 'general';
    const pic = socket.data.pic || null;
    const r = ensureRoom(room);

    const msg = {
      name,
      text: String(text || '').slice(0, 500),
      time: Date.now(),
      pic
    };
    if (!msg.text) return;

    r.history.push(msg);
    if (r.history.length > MAX_HISTORY) r.history.shift();

    io.to(room).emit('message', msg);
  });

  // Typing indicator
  socket.on('typing', (isTyping) => {
    const name = socket.data.name || 'Guest';
    const room = socket.data.room || 'general';
    socket.to(room).emit('typing', { name, isTyping: Boolean(isTyping) });
  });

  // Handle room switch
  socket.on('switchRoom', (newRoom) => {
    const oldRoom = socket.data.room;
    if (oldRoom === newRoom) return;

    // Leave old
    if (oldRoom && rooms.has(oldRoom)) {
      const r = rooms.get(oldRoom);
      r.users.delete(socket.id);
      io.to(oldRoom).emit('system', {
        type: 'leave',
        text: `${socket.data.name} left`,
        online: r.users.size,
        time: Date.now()
      });
    }

    // Join new
    socket.data.room = newRoom;
    const r = ensureRoom(newRoom);
    r.users.set(socket.id, { name: socket.data.name, pic: socket.data.pic });
    socket.join(newRoom);

    socket.emit('history', r.history);
    io.to(newRoom).emit('system', {
      type: 'join',
      text: `${socket.data.name} joined`,
      online: r.users.size,
      time: Date.now()
    });

    broadcastRooms();
  });

  // Disconnect
  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (!room) return;
    const r = rooms.get(room);
    if (!r) return;

    r.users.delete(socket.id);

    io.to(room).emit('system', {
      type: 'leave',
      text: `${socket.data.name || 'Guest'} left`,
      online: r.users.size,
      time: Date.now()
    });

    broadcastRooms();
  });

  // Helper: broadcast all rooms + user counts
  function broadcastRooms() {
    const roomList = {};
    for (const [roomName, r] of rooms.entries()) {
      roomList[roomName] = r.users.size;
    }
    io.emit('roomList', roomList);
  }
});

httpServer.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
