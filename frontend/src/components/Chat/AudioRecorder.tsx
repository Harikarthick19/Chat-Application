import React, { useState, useEffect, useRef } from 'react';
import styles from './AudioRecorder.module.css';
import { Trash2, StopCircle, Play, Pause, Send } from 'lucide-react';

interface AudioRecorderProps {
  onSend: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onSend, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Start recording on mount
  useEffect(() => {
    startRecording();
    return () => {
      stopRecordingSession();
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  // Duration Timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(url);
        setIsRecording(false);
        
        // Stop all audio tracks from stream to release the mic icon!
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
    } catch (err) {
      console.error('Error opening microphone:', err);
      alert('Could not access microphone. Please check permissions.');
      onCancel();
    }
  };

  const stopRecordingSession = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleStop = () => {
    stopRecordingSession();
  };

  const handleDelete = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPlayingPreview(false);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    onCancel();
  };

  const handleTogglePreview = () => {
    if (!audioUrl) return;

    if (isPlayingPreview && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;
      audio.play().catch(console.error);
      setIsPlayingPreview(true);

      audio.onended = () => {
        setIsPlayingPreview(false);
      };
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, duration);
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className={styles.recorderContainer}>
      {isRecording ? (
        <div className={styles.recordingState}>
          <div className={styles.pulseDot} />
          <span>Recording Voice</span>
          <div className={styles.waveformSim}>
            <div className={styles.waveBar} />
            <div className={styles.waveBar} />
            <div className={styles.waveBar} />
            <div className={styles.waveBar} />
            <div className={styles.waveBar} />
          </div>
          <span className={styles.durationText}>{formatDuration(duration)}</span>
        </div>
      ) : (
        <div className={styles.previewPlayer}>
          <button className={styles.actionBtn} onClick={handleTogglePreview}>
            {isPlayingPreview ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <span style={{ fontSize: '13px', marginLeft: '10px', color: 'var(--text-muted)' }}>
            Voice Note Preview ({formatDuration(duration)})
          </span>
        </div>
      )}

      <div className={styles.controls}>
        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={handleDelete} title="Delete">
          <Trash2 size={18} />
        </button>

        {isRecording ? (
          <button className={styles.actionBtn} onClick={handleStop} title="Stop">
            <StopCircle size={18} />
          </button>
        ) : (
          <button className={`${styles.actionBtn} ${styles.actionBtnSuccess}`} onClick={handleSend} title="Send">
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
export default AudioRecorder;
