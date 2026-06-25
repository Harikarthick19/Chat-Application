import http from 'http';
import app from './app';
import { SocketManager } from './socket/socket.manager';
import dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.IO with the server instance
SocketManager.initialize(server);

server.listen(port, () => {
  console.log(`========================================`);
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`💬 Socket.IO server bound successfully`);
  console.log(`========================================`);
});
