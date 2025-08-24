// Parse room from URL (?room=myroom)
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
  
  let socket = null;
  let typingTimer = null;
  
  function setStatus(text) {
    statusEl.textContent = text;
  }
  
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  function addSystem(text) {
    const li = document.createElement('li');
    li.className = 'system';
    li.textContent = text;
    messagesEl.appendChild(li);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  
  function addMessage({ name, text, time }) {
    const li = document.createElement('li');
    li.className = 'msg';
  
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
    roomNameEl.textContent = `#${room}`;
  }
  
  function showJoinUI() {
    chatSection.classList.add('hidden');
    joinSection.classList.remove('hidden');
  }
  
  function connect(name, room) {
    socket = io({ transports: ['websocket', 'polling'] });
  
    socket.on('connect', () => {
      setStatus('online');
      socket.emit('join', { name, room });
    });
  
    socket.on('disconnect', () => {
      setStatus('offline');
    });
  
    socket.on('history', (history) => {
      messagesEl.innerHTML = '';
      history.forEach(addMessage);
    });
  
    socket.on('message', (msg) => {
      addMessage(msg);
    });
  
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
  
    // typing indicator
    msgInput.addEventListener('input', () => {
      socket.emit('typing', msgInput.value.trim().length > 0);
    });
  }
  
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
  
  // Prefill room from URL
  const initialRoom = getRoomFromQuery();
  if (initialRoom) {
    roomInput.value = initialRoom;
  }
  