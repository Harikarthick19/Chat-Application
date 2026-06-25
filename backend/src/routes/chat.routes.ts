import { Router } from 'express';
import { ChatController } from '../controllers/ChatController';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', ChatController.getChats);
router.post('/', ChatController.getOrCreate);
router.get('/:chatId/messages', ChatController.getMessages);
router.post('/:chatId/seen', ChatController.markSeen);

export default router;
