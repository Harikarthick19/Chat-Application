import { Router } from 'express';
import { UploadController } from '../controllers/UploadController';
import { authenticateJWT } from '../middlewares/auth.middleware';
import upload from '../config/multer';

const router = Router();

router.use(authenticateJWT);

router.post('/image', upload.single('image'), UploadController.uploadImage);
router.post('/audio', upload.single('audio'), UploadController.uploadAudio);
router.post('/document', upload.single('document'), UploadController.uploadDocument);
router.post('/avatar', upload.single('avatar'), UploadController.uploadAvatar);

export default router;
