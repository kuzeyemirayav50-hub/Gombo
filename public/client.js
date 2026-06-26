const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const nicknameInput = document.getElementById('nicknameInput');
const passwordInput = document.getElementById('passwordInput');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messageList = document.getElementById('messageList');
const logoutButton = document.getElementById('logoutButton');
const authSubmitButton = document.getElementById('authSubmitButton');
const authHint = document.getElementById('authHint');
const authModeButtons = Array.from(document.querySelectorAll('.tab'));

const SESSION_STORAGE_KEY = 'gomboAuthToken';

let socket;
let nickname = '';
let authToken = localStorage.getItem(SESSION_STORAGE_KEY) || '';
let authenticated = false;
let authMode = 'login';

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

function setOverlayVisible(visible) {
  loginOverlay.classList.toggle('active', visible);
}

function updateAuthModeUI() {
  authModeButtons.forEach((button) => {
    const isActive = button.dataset.mode === authMode;
    button.classList.toggle('active', isActive);
  });

  authSubmitButton.textContent = authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  authHint.textContent = authMode === 'login' ? 'Mevcut hesabınla giriş yap.' : 'Yeni hesap oluştur.';
}

function persistSession(token) {
  if (token) {
    localStorage.setItem(SESSION_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function clearSession() {
  authToken = '';
  nickname = '';
  authenticated = false;
  persistSession('');
  logoutButton.classList.add('hidden');
}

function initializeSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = io();

  socket.on('connect', () => {
    if (authToken) {
      socket.emit('authenticate', { token: authToken });
    }
  });

  socket.on('authSuccess', () => {
    authenticated = true;
    logoutButton.classList.remove('hidden');
    setOverlayVisible(false);
  });

  socket.on('authFailed', () => {
    authenticated = false;
    clearSession();
    alert('Oturum doğrulama başarısız oldu. Lütfen tekrar giriş yapın.');
    setOverlayVisible(true);
  });

  socket.on('receiveMessage', (payload) => {
    addMessage(payload);
  });

  socket.on('userJoined', (payload) => {
    addMessage(payload);
  });
}

async function restoreSession() {
  if (!authToken) {
    return;
  }

  try {
    const response = await fetch('/api/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: authToken }),
    });

    if (!response.ok) {
      throw new Error('Oturum bulunamadı.');
    }

    const data = await response.json();
    nickname = data.user.nickname;
    messageList.innerHTML = '';
    data.messages.forEach(addMessage);
    initializeSocket();
  } catch (error) {
    clearSession();
    setOverlayVisible(true);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nick = nicknameInput.value.trim();
  const pass = passwordInput.value.trim();

  if (!nick || !pass) {
    return;
  }

  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nickname: nick, password: pass, mode: authMode }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Giriş yapılamadı.');
      return;
    }

    const data = await response.json();
    nickname = data.user.nickname;
    authToken = data.token;
    persistSession(authToken);

    messageList.innerHTML = '';
    data.messages.forEach(addMessage);

    initializeSocket();
  } catch (error) {
    alert('Sunucuya bağlanırken hata oluştu.');
  }
});

logoutButton.addEventListener('click', () => {
  if (socket) {
    socket.disconnect();
  }
  clearSession();
  setOverlayVisible(true);
  messageList.innerHTML = '';
});

authModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    authMode = button.dataset.mode;
    updateAuthModeUI();
  });
});

updateAuthModeUI();
restoreSession();

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();

  if (!message || !authenticated || !socket) {
    return;
  }

  socket.emit('sendMessage', { message });
  addMessage({ username: nickname, message, timestamp: new Date().toISOString() });
  messageInput.value = '';
});
