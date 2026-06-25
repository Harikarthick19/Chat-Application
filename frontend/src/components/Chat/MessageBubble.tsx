import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../../types';
import styles from './MessageBubble.module.css';
import { Check, CheckCheck, Loader2, FileText, Download, MoreVertical, Trash2 } from 'lucide-react';
import { VoicePlayer } from './VoicePlayer';
import { ImageModal } from './ImageModal';
import { api } from '../../services/api';

// In production (Railway): VITE_BACKEND_ORIGIN='' → relative paths served by same origin
// In development: falls back to dynamic localhost:5001
const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN !== undefined
  ? import.meta.env.VITE_BACKEND_ORIGIN
  : `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:5001`;

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  peerUser: { id: string; username: string; avatar_url?: string };
  uploadProgress?: number; 
  onDeleteLocally?: (messageId: string) => void;
}

const resolveUrl = (urlOrPath: string) => {
  if (!urlOrPath) return urlOrPath;
  if (urlOrPath.startsWith('http') || urlOrPath.startsWith('blob:')) return urlOrPath;
  return `${BACKEND_ORIGIN}${urlOrPath}`;
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUserId,
  peerUser,
  uploadProgress,
  onDeleteLocally,
}) => {
  const isOutgoing = message.sender_id === currentUserId;
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close options menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    };
    if (showOptions) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showOptions]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderStatus = () => {
    if (!isOutgoing) return null;
    const status = message.statuses[peerUser.id] || 'sent';
    if (status === 'sent') {
      return <Check size={14} className={styles.statusIcon} color="#b0bec5" />;
    }
    if (status === 'delivered') {
      return <CheckCheck size={14} className={styles.statusIcon} color="#b0bec5" />;
    }
    return <CheckCheck size={14} className={styles.statusIcon} color="#4caf50" />;
  };

  const handleDelete = async (scope: 'me' | 'everyone') => {
    setShowOptions(false);
    try {
      await api.delete(`/messages/${message.id}`, { scope });
      if (scope === 'me' && onDeleteLocally) {
        onDeleteLocally(message.id);
      }
    } catch (err: any) {
      console.error('Failed to delete message:', err);
      alert(err.error || 'Failed to delete message.');
    }
  };

  const renderContent = () => {
    switch (message.message_type) {
      case 'image': {
        const fileUrl = resolveUrl(message.media_file_url || message.content);
        const isUploading = uploadProgress !== undefined && uploadProgress < 100;

        return (
          <>
            <div className={styles.imageWrapper} onClick={() => !isUploading && setIsLightboxOpen(true)}>
              <img
                src={fileUrl}
                alt={message.media_file_name || 'Uploaded photo'}
                className={styles.imageContent}
              />
              {isUploading && (
                <div className={styles.uploadOverlay}>
                  <Loader2 className="animate-spin" size={18} />
                  <span>{uploadProgress}%</span>
                  <div className={styles.progressBarContainer}>
                    <div className={styles.progressBar} style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
            {isLightboxOpen && (
              <ImageModal
                fileUrl={fileUrl}
                fileName={message.media_file_name || 'download.jpg'}
                onClose={() => setIsLightboxOpen(false)}
              />
            )}
          </>
        );
      }

      case 'audio': {
        const fileUrl = resolveUrl(message.voice_file_url || message.content);
        return (
          <div className={styles.voiceContent}>
            <VoicePlayer fileUrl={fileUrl} duration={message.voice_duration} />
          </div>
        );
      }

      case 'document': {
        const fileUrl = resolveUrl(message.media_file_url || message.content);
        const fileName = message.media_file_name || message.content || 'document';
        const fileSize = formatFileSize(message.media_file_size);
        const isUploading = uploadProgress !== undefined && uploadProgress < 100;

        return (
          <div className={styles.documentCard}>
            <div className={styles.documentIcon}>
              <FileText size={28} color="var(--primary)" />
            </div>
            <div className={styles.documentInfo}>
              <span className={styles.documentName}>{fileName}</span>
              {fileSize && <span className={styles.documentSize}>{fileSize}</span>}
              {isUploading && (
                <div className={styles.progressBarContainer} style={{ marginTop: '6px' }}>
                  <div className={styles.progressBar} style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>
            {!isUploading && (
              <a
                href={fileUrl}
                download={fileName}
                className={styles.downloadBtn}
                title="Download file"
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={16} />
              </a>
            )}
          </div>
        );
      }

      default:
        return <span>{message.content}</span>;
    }
  };

  const avatarSrc = peerUser.avatar_url
    ? resolveUrl(peerUser.avatar_url)
    : `https://api.dicebear.com/7.x/adventurer/svg?seed=${peerUser.username}`;

  return (
    <div
      className={`${styles.bubbleWrapper} ${
        isOutgoing ? styles.bubbleWrapperOutgoing : styles.bubbleWrapperIncoming
      }`}
    >
      {!isOutgoing && (
        <img
          src={avatarSrc}
          className={styles.avatar}
          alt={peerUser.username}
        />
      )}

      <div
        className={`${styles.bubbleCard} ${
          isOutgoing ? styles.bubbleCardOutgoing : styles.bubbleCardIncoming
        }`}
      >
        {/* Hover Options Trigger */}
        <div className={styles.optionsWrapper} ref={menuRef}>
          <button 
            type="button" 
            className={styles.optionsBtn}
            onClick={() => setShowOptions(!showOptions)}
            title="Options"
          >
            <MoreVertical size={14} />
          </button>
          
          {showOptions && (
            <div className={`${styles.dropdownMenu} glass-container`}>
              <button 
                type="button" 
                className={styles.dropdownItem}
                onClick={() => handleDelete('me')}
              >
                <Trash2 size={12} />
                <span>Delete for me</span>
              </button>
              {isOutgoing && (
                <button 
                  type="button" 
                  className={`${styles.dropdownItem} ${styles.danger}`}
                  onClick={() => handleDelete('everyone')}
                >
                  <Trash2 size={12} />
                  <span>Delete for everyone</span>
                </button>
              )}
            </div>
          )}
        </div>

        {renderContent()}

        <div className={`${styles.metaRow} ${isOutgoing ? styles.metaRowOutgoing : styles.metaRowIncoming}`}>
          <span className={styles.timeText}>{formatTime(message.created_at)}</span>
          {renderStatus()}
        </div>
      </div>
    </div>
  );
};
export default MessageBubble;
