const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const nicknameInput = document.getElementById('nicknameInput');
const passwordInput = document.getElementById('passwordInput');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messageList = document.getElementById('messageList');

let socket;
let nickname = '';
let password = '';

function addMessage({ username, message, timestamp }) {
  const item = document.createElement('div');
  item.className = 'message';
  const time = new Date(timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  item.innerHTML = `
    <strong>${username}</strong>
    <span>${message}</span>
    <small>${time}</small>
  `;
  messageList.appendChild(item);
  messageList.scrollTop = messageList.scrollHeight;
}

function initializeSocket() {
  socket = io();
  socket.on('connect', () => {
    socket.emit('joinRoom', 'gombo');
  });

  socket.on('receiveMessage', (payload) => {
    addMessage(payload);
  });

  socket.on('userJoined', ({ userId, message }) => {
    addMessage({ username: 'Gombo', message: `Yeni kullanıcı bağlandı.`, timestamp: Date.now() });
  });
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const nick = nicknameInput.value.trim();
  const pass = passwordInput.value.trim();

  if (!nick || !pass) {
    return;
  }

  nickname = nick;
  password = pass;
  loginOverlay.classList.remove('active');
  initializeSocket();
});

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();

  if (!message || !nickname || !password) {
    return;
  }

  socket.emit('sendMessage', {
    room: 'gombo',
    username: nickname,
    password,
    message,
  });

  addMessage({ username: nickname, message, timestamp: Date.now() });
  messageInput.value = '';
});
