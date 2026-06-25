import { Response } from 'express';
import { AuthenticatedRequest } from '../types';

export class UploadController {
  static async uploadImage(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }
    
    // Normalize path separators to forward slashes for URLs
    const filename = req.file.filename;
    const fileUrl = `/uploads/images/${filename}`;

    res.status(200).json({
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });
  }

  static async uploadAudio(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }
    
    const filename = req.file.filename;
    const fileUrl = `/uploads/audio/${filename}`;

    res.status(200).json({
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });
  }

  static async uploadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.file) {
      res.status(400).json({ error: 'No document file uploaded' });
      return;
    }
    
    const filename = req.file.filename;
    const fileUrl = `/uploads/others/${filename}`;

    res.status(200).json({
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });
  }

  static async uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.file) {
      res.status(400).json({ error: 'No avatar file uploaded' });
      return;
    }
    
    const filename = req.file.filename;
    const fileUrl = `/uploads/images/${filename}`;

    res.status(200).json({
      fileUrl,
    });
  }
}
