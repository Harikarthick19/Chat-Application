import React from 'react';
import styles from './ImageModal.module.css';
import { X, Download } from 'lucide-react';
import { BASE_URL } from '../../services/api';

interface ImageModalProps {
  fileUrl: string;
  fileName: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ fileUrl, fileName, onClose }) => {
  const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${BASE_URL.replace('/api', '')}${fileUrl}`;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = fileName || 'image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          <X size={24} />
        </button>

        <img src={fullUrl} alt={fileName} className={styles.image} />

        <div className={styles.controlBar}>
          <button className={styles.btn} onClick={handleDownload}>
            <Download size={16} />
            <span>Download Image</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default ImageModal;
