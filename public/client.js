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
const friendForm = document.getElementById('friendForm');
const friendInput = document.getElementById('friendInput');
const friendsList = document.getElementById('friendsList');
const chatTitle = document.getElementById('chatTitle');
const globalModeButton = document.getElementById('globalModeButton');
const dmModeButton = document.getElementById('dmModeButton');

const SESSION_STORAGE_KEY = 'gomboAuthToken';

let socket;
let nickname = '';
let currentUserId = null;
let authToken = localStorage.getItem(SESSION_STORAGE_KEY) || '';
let authenticated = false;
let authMode = 'login';
let friends = [];
let activeFriend = null;
let channelMode = 'global';
let globalMessages = [];
let dmMessages = {};

function addMessageToList({ username, message, timestamp }) {
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

function renderMessages() {
  messageList.innerHTML = '';
  const items = channelMode === 'dm' && activeFriend ? (dmMessages[activeFriend.id] || []) : globalMessages;

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'message';
    empty.innerHTML = `<strong>${channelMode === 'dm' ? 'DM' : 'Sohbet'}</strong><span>${channelMode === 'dm' ? 'Bu konuşmada henüz mesaj yok.' : 'Henüz genel mesaj yok.'}</span>`;
    messageList.appendChild(empty);
    return;
  }

  items.forEach(addMessageToList);
}

function renderFriends() {
  friendsList.innerHTML = '';

  if (!friends.length) {
    const empty = document.createElement('li');
    empty.className = 'message';
    empty.textContent = 'Henüz arkadaş yok.';
    friendsList.appendChild(empty);
    return;
  }

  friends.forEach((friend) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `friend-item${activeFriend && activeFriend.id === friend.id ? ' active' : ''}`;
    button.textContent = friend.nickname;
    button.addEventListener('click', () => openConversation(friend));
    item.appendChild(button);
    friendsList.appendChild(item);
  });
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
  currentUserId = null;
  authenticated = false;
  friends = [];
  activeFriend = null;
  channelMode = 'global';
  globalMessages = [];
  dmMessages = {};
  persistSession('');
  logoutButton.classList.add('hidden');
  renderFriends();
  renderMessages();
}

function setChannelMode(mode) {
  channelMode = mode;
  globalModeButton.classList.toggle('active', mode === 'global');
  dmModeButton.classList.toggle('active', mode === 'dm');
  chatTitle.textContent = mode === 'dm' && activeFriend ? `DM · ${activeFriend.nickname}` : 'Genel Sohbet';
  renderMessages();
}

function openConversation(friend) {
  activeFriend = friend;
  setChannelMode('dm');
  renderFriends();
  if (socket) {
    socket.emit('loadConversation', { friendId: friend.id });
  }
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

  socket.on('authSuccess', ({ user }) => {
    authenticated = true;
    currentUserId = user.id;
    nickname = user.nickname;
    logoutButton.classList.remove('hidden');
    setOverlayVisible(false);
  });

  socket.on('authFailed', () => {
    authenticated = false;
    clearSession();
    alert('Oturum doğrulama başarısız oldu. Lütfen tekrar giriş yapın.');
    setOverlayVisible(true);
  });

  socket.on('friendsList', ({ friends: nextFriends }) => {
    friends = nextFriends;
    renderFriends();
  });

  socket.on('friendAdded', ({ friend }) => {
    friends = [...friends, friend];
    renderFriends();
  });

  socket.on('friendError', ({ error }) => {
    alert(error);
  });

  socket.on('conversationLoaded', ({ friendId, messages }) => {
    dmMessages[friendId] = messages || [];
    if (channelMode === 'dm' && activeFriend && activeFriend.id === friendId) {
      renderMessages();
    }
  });

  socket.on('receiveMessage', (payload) => {
    globalMessages.push(payload);
    if (channelMode === 'global') {
      renderMessages();
    }
  });

  socket.on('receivePrivateMessage', (payload) => {
    const friendId = payload.fromId === currentUserId ? payload.toId : payload.fromId;
    if (!dmMessages[friendId]) {
      dmMessages[friendId] = [];
    }
    dmMessages[friendId].push(payload);

    if (channelMode === 'dm' && activeFriend && activeFriend.id === friendId) {
      renderMessages();
    }
  });

  socket.on('userJoined', (payload) => {
    globalMessages.push(payload);
    if (channelMode === 'global') {
      renderMessages();
    }
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
    currentUserId = data.user.id;
    globalMessages = data.messages || [];
    renderMessages();
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
    currentUserId = data.user.id;
    authToken = data.token;
    persistSession(authToken);
    globalMessages = data.messages || [];
    renderMessages();
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
});

authModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    authMode = button.dataset.mode;
    updateAuthModeUI();
  });
});

friendForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const nicknameToAdd = friendInput.value.trim();

  if (!nicknameToAdd || !socket || !authenticated) {
    return;
  }

  socket.emit('addFriend', { nickname: nicknameToAdd });
  friendInput.value = '';
});

globalModeButton.addEventListener('click', () => {
  setChannelMode('global');
});

dmModeButton.addEventListener('click', () => {
  if (!activeFriend) {
    alert('Önce bir arkadaş seçin.');
    return;
  }
  setChannelMode('dm');
});

updateAuthModeUI();
renderFriends();
renderMessages();
restoreSession();

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();

  if (!message || !authenticated || !socket) {
    return;
  }

  if (channelMode === 'dm' && activeFriend) {
    socket.emit('sendPrivateMessage', { friendId: activeFriend.id, message });
    const payload = {
      fromId: currentUserId,
      toId: activeFriend.id,
      username: nickname,
      message,
      timestamp: new Date().toISOString(),
    };
    if (!dmMessages[activeFriend.id]) {
      dmMessages[activeFriend.id] = [];
    }
    dmMessages[activeFriend.id].push(payload);
    renderMessages();
  } else {
    socket.emit('sendMessage', { message });
    globalMessages.push({ username: nickname, message, timestamp: new Date().toISOString() });
    renderMessages();
  }

  messageInput.value = '';
});
