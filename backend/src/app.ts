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

// Required for Render/Railway/Heroku reverse proxy (fixes express-rate-limit X-Forwarded-For error)
app.set('trust proxy', 1);

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

// Rate Limiter — disable X-Forwarded-For validation (Render sets this header; we handle it via trust proxy)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // prevents crash on Render/Railway proxies
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
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'API is running' });
});

// Always serve the React frontend build (production on Render)
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // Only non-API routes serve index.html (SPA routing)
  app.get(/^(?!\/api|\/uploads|\/health).*$/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(200).json({ status: 'API is running — frontend not built' });
  });
}

// Centralized error boundary
app.use(errorHandler);

export default app;
