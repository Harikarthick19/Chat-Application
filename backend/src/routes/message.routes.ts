import { Router } from 'express';
import { MessageController } from '../controllers/MessageController';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.post('/', MessageController.send);
router.post('/seen', MessageController.markSeen);
router.delete('/:messageId', MessageController.deleteMessage);

export default router;

