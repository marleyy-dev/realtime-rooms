// --- Utility ---
function getRoomFromQuery() {
  const params = new URLSearchParams(location.search);
  const r = params.get('room');
  return r ? r.trim().toLowerCase() : '';
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const statusEl = $('#status');
const joinSection = document.querySelector('.join');
const chatSection = $('#chat');
const roomInput = $('#room');
const nameInput = $('#name');
const joinBtn = $('#joinBtn');
const leaveBtn = $('#leaveBtn');
const roomNameEl = $('#roomName');
const onlineEl = $('#online');
const messagesEl = $('#messages');
const sendForm = $('#sendForm');
const msgInput = $('#msg');
const typingEl = $('#typing');

const settingsBtn = $('#settingsBtn');
const settingsMenu = $('#settingsMenu');
const profilePicInput = $('#profilePicInput');
const closeSettingsBtn = $('#closeSettings');
const roomSidebar = $('#roomSidebar');
const roomListEl = $('#roomList');

let socket = null;
let typingTimer = null;
let profilePic = null;

// --- Helpers ---
function setStatus(text) { statusEl.textContent = text; }
function formatTime(ts) { return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }

function addSystem(text) {
  const li = document.createElement('li');
  li.className = 'system';
  li.textContent = text;
  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage({ name, text, time, pic }) {
  const li = document.createElement('li');
  li.className = 'msg';

  if (pic) {
    const img = document.createElement('img');
    img.src = pic;
    img.width = 32;
    img.height = 32;
    img.className = 'msg-pic';
    li.appendChild(img);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'name';
  nameEl.textContent = name;

  const textEl = document.createElement('span');
  textEl.className = 'text';
  textEl.textContent = text;

  const timeEl = document.createElement('span');
  timeEl.className = 'time';
  timeEl.textContent = `• ${formatTime(time)}`;

  li.appendChild(nameEl);
  li.appendChild(textEl);
  li.appendChild(timeEl);

  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showChatUI(room) {
  joinSection.classList.add('hidden');
  chatSection.classList.remove('hidden');
  roomSidebar.classList.remove('hidden');
  roomNameEl.textContent = `#${room}`;
}

function showJoinUI() {
  chatSection.classList.add('hidden');
  roomSidebar.classList.add('hidden');
  joinSection.classList.remove('hidden');
}

// --- Socket connection ---
function connect(name, room) {
  socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    setStatus('online');
    socket.emit('join', { name, room, pic: profilePic });
  });

  socket.on('disconnect', () => setStatus('offline'));

  socket.on('history', (history) => {
    messagesEl.innerHTML = '';
    history.forEach(addMessage);
  });

  socket.on('message', addMessage);

  socket.on('system', (evt) => {
    addSystem(evt.text);
    onlineEl.textContent = `(${evt.online} online)`;
  });

  socket.on('typing', ({ name, isTyping }) => {
    typingEl.textContent = `${name} is typing…`;
    typingEl.classList.toggle('hidden', !isTyping);
    if (isTyping) {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => typingEl.classList.add('hidden'), 1500);
    }
  });

  // Update room list
  socket.on('roomList', (rooms) => {
    roomListEl.innerHTML = '';
    Object.entries(rooms).forEach(([roomName, count]) => {
      const li = document.createElement('li');
      li.textContent = `${roomName} (${count})`;
      const btn = document.createElement('button');
      btn.textContent = '→';
      btn.onclick = () => socket.emit('switchRoom', roomName);
      li.appendChild(btn);
      roomListEl.appendChild(li);
    });
  });

  // Typing indicator
  msgInput.addEventListener('input', () => {
    socket.emit('typing', msgInput.value.trim().length > 0);
  });
}

// --- Events ---
joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Guest';
  const room = (roomInput.value.trim() || 'general').toLowerCase();
  history.replaceState(null, '', `?room=${encodeURIComponent(room)}`);
  showChatUI(room);
  connect(name, room);
});

leaveBtn.addEventListener('click', () => {
  if (socket) socket.disconnect();
  showJoinUI();
  setStatus('offline');
});

sendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !socket) return;
  socket.emit('message', text);
  msgInput.value = '';
  socket.emit('typing', false);
});

// --- Settings menu ---
settingsBtn.addEventListener('click', () => settingsMenu.classList.toggle('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsMenu.classList.add('hidden'));

profilePicInput.addEventListener('change', () => {
  const file = profilePicInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    profilePic = e.target.result;
    if (socket) socket.emit('setProfilePic', profilePic);
  };
  reader.readAsDataURL(file);
});

// --- Prefill room from URL ---
const initialRoom = getRoomFromQuery();
if (initialRoom) roomInput.value = initialRoom;
