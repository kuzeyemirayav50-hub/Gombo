const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const DB_PATH = path.join(__dirname, 'db.json');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseServiceRoleKey) {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function loadDatabase() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { users: [], messages: [] };
  }
}

function saveDatabase(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

const dbData = loadDatabase();
const sessions = new Map();

async function findUserByNickname(nickname) {
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*').eq('nickname', nickname).maybeSingle();
    if (error) {
      throw error;
    }
    return data;
  }

  return dbData.users.find((user) => user.nickname === nickname);
}

async function addUser(nickname, passwordHash) {
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .insert({ nickname, password_hash: passwordHash })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const nextId = dbData.users.length > 0 ? Math.max(...dbData.users.map((u) => u.id)) + 1 : 1;
  const user = {
    id: nextId,
    nickname,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  dbData.users.push(user);
  saveDatabase(dbData);
  return user;
}

async function addMessage(userId, username, message) {
  if (supabase) {
    const { data, error } = await supabase
      .from('messages')
      .insert({ user_id: userId, username, message })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const nextId = dbData.messages.length > 0 ? Math.max(...dbData.messages.map((msg) => msg.id)) + 1 : 1;
  const record = {
    id: nextId,
    userId,
    username,
    message,
    createdAt: new Date().toISOString(),
  };
  dbData.messages.push(record);
  saveDatabase(dbData);
  return record;
}

async function getRecentMessages() {
  if (supabase) {
    const { data, error } = await supabase
      .from('messages')
      .select('username, message, created_at')
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      throw error;
    }

    return (data || []).map((message) => ({
      username: message.username,
      message: message.message,
      timestamp: message.created_at,
    }));
  }

  return dbData.messages
    .slice(-100)
    .map((message) => ({
      username: message.username,
      message: message.message,
      timestamp: message.createdAt,
    }));
}

async function handleAuthRequest({ nickname, password, mode = 'login' }) {
  if (!nickname || !password) {
    const error = new Error('Nickname ve şifre gereklidir.');
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await findUserByNickname(nickname);

  if (mode === 'signup') {
    if (existingUser) {
      const error = new Error('Bu nickname zaten kullanılıyor.');
      error.statusCode = 409;
      throw error;
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = await addUser(nickname, hashedPassword);
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { id: newUser.id, nickname: newUser.nickname });

    return {
      user: { id: newUser.id, nickname: newUser.nickname },
      token,
      messages: await getRecentMessages(),
    };
  }

  if (!existingUser) {
    const error = new Error('Bu kullanıcı bulunamadı. Önce kayıt olun.');
    error.statusCode = 404;
    throw error;
  }

  const match = bcrypt.compareSync(password, existingUser.password_hash || existingUser.passwordHash);
  if (!match) {
    const error = new Error('Yanlış şifre.');
    error.statusCode = 401;
    throw error;
  }

  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { id: existingUser.id, nickname: existingUser.nickname });

  return {
    user: { id: existingUser.id, nickname: existingUser.nickname },
    token,
    messages: await getRecentMessages(),
  };
}

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth', async (req, res) => {
  try {
    const result = await handleAuthRequest({
      nickname: req.body.nickname,
      password: req.body.password,
      mode: req.body.mode,
    });
    return res.json(result);
  } catch (error) {
    console.error('Auth hatası:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Sunucu hatası.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const result = await handleAuthRequest({
      nickname: req.body.nickname,
      password: req.body.password,
      mode: 'login',
    });
    return res.json(result);
  } catch (error) {
    console.error('Login hatası:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Sunucu hatası.' });
  }
});

app.post('/api/restore', async (req, res) => {
  const { token } = req.body;
  const user = sessions.get(token);

  if (!user) {
    return res.status(401).json({ error: 'Oturum bulunamadı.' });
  }

  return res.json({
    user,
    messages: await getRecentMessages(),
  });
});

app.get('/api/messages', async (req, res) => {
  try {
    return res.json({ messages: await getRecentMessages() });
  } catch (error) {
    console.error('Mesaj çekme hatası:', error);
    return res.status(500).json({ error: 'Mesajlar yüklenemedi.' });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  socket.on('authenticate', ({ token }) => {
    const user = sessions.get(token);
    if (!user) {
      socket.emit('authFailed', { error: 'Kimlik doğrulama başarısız.' });
      return;
    }

    socket.data.user = user;
    socket.join('gombo');
    socket.emit('authSuccess', { user });
    socket.to('gombo').emit('userJoined', {
      username: 'Gombo',
      message: `${user.nickname} sohbete katıldı.`,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('sendMessage', async ({ message }) => {
    const user = socket.data.user;
    if (!user || !message || !message.trim()) {
      return;
    }

    try {
      const record = await addMessage(user.id, user.nickname, message);

      const payload = {
        username: user.nickname,
        message,
        timestamp: record.created_at || record.createdAt,
      };

      socket.to('gombo').emit('receiveMessage', payload);
    } catch (error) {
      console.error('Mesaj kaydetme hatası:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Gombo sohbet sunucusu ${PORT} portunda çalışıyor.`);
  if (supabase) {
    console.log('Supabase bağlantısı aktif.');
  } else {
    console.log('Supabase ayarları yok, yerel db.json dosyası kullanılacak.');
  }
});
