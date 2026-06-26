const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`Kullanıcı ${socket.id} ${room} odasına katıldı.`);
    socket.to(room).emit('userJoined', {
      userId: socket.id,
      message: 'Yeni bir kullanıcı katıldı.',
    });
  });

  socket.on('sendMessage', ({ room, username, message }) => {
    const payload = {
      userId: socket.id,
      username,
      message,
      timestamp: new Date(),
    };
    socket.to(room).emit('receiveMessage', payload);
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Gombo sohbet sunucusu ${PORT} portunda çalışıyor.`);
});
