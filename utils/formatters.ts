
import type { SubtitleEntry } from '../types';

// Helper to format seconds into HH:MM:SS,mmm for SRT format
export const formatTimestamp = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000).toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds},${milliseconds}`;
};

export function formatSrt(data: SubtitleEntry[]): string {
  // Renumber entries to ensure sequential IDs after filtering
  return data
    .map(
      (entry, index) => `${index + 1}\n${entry.startTime} --> ${entry.endTime}\n${entry.chineseText}`
    )
    .join('\n\n');
}
