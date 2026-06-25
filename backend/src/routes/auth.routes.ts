import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { registerSchema, loginSchema, updateProfileSchema } from '../utils/schemas';

const router = Router();

router.post('/register', validateBody(registerSchema), AuthController.register);
router.post('/login', validateBody(loginSchema), AuthController.login);
router.get('/me', authenticateJWT, AuthController.getMe);
router.put('/profile', authenticateJWT, validateBody(updateProfileSchema), AuthController.updateProfile);
router.get('/search', authenticateJWT, AuthController.search);

export default router;
