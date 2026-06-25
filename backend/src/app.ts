import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes';
import chatRoutes from './routes/chat.routes';
import messageRoutes from './routes/message.routes';
import uploadRoutes from './routes/upload.routes';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

// Security configurations
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows images/audio to load on client side from different origin
  })
);

// CORS configurations
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Rate Limiter for general endpoints
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload folders are present
const rootUploadDir = path.join(process.cwd(), 'uploads');
const dirs = [
  rootUploadDir,
  path.join(rootUploadDir, 'images'),
  path.join(rootUploadDir, 'audio'),
  path.join(rootUploadDir, 'others'),
];

dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Serve media static assets
app.use('/uploads', express.static(rootUploadDir));

// Connect API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'API is running' });
});

// Centralized error boundary
app.use(errorHandler);

export default app;
