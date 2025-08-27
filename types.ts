
export interface AudioChunkData {
  startTime: number; // in seconds
  duration: number; // in seconds
  base64: string; // base64 encoded audio data in WAV format
}

export interface SubtitleEntry {
  id: number;
  startTime: string;
  endTime: string;
  chineseText: string;
}
