import React, { useState, useEffect, useRef } from 'react';
import styles from './VoicePlayer.module.css';
import { Play, Pause, Download } from 'lucide-react';
import { BASE_URL } from '../../services/api';

interface VoicePlayerProps {
  fileUrl: string;
  duration?: number;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({ fileUrl, duration = 0 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${BASE_URL.replace('/api', '')}${fileUrl}`;

  useEffect(() => {
    const audio = new Audio(fullUrl);
    audioRef.current = audio;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audioRef.current = null;
    };
  }, [fullUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const value = parseFloat(e.target.value);
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = fileUrl.split('/').pop() || 'voice-note.webm';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={styles.playerContainer} onClick={(e) => e.stopPropagation()}>
      <button className={styles.controlBtn} onClick={togglePlay}>
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>

      <div className={styles.trackWrapper}>
        <input
          type="range"
          min="0"
          max={totalDuration || 1}
          value={currentTime}
          onChange={handleSeek}
          className={styles.seekBar}
        />
        <div className={styles.timeRow}>
          <span>{formatTime(currentTime)}</span>
          <span className={styles.duration}>{formatTime(totalDuration)}</span>
        </div>
      </div>

      <button className={styles.downloadBtn} onClick={handleDownload} title="Download Audio">
        <Download size={14} />
      </button>
    </div>
  );
};
export default VoicePlayer;
