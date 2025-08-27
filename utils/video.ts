
import type { AudioChunkData } from '../types';

// Helper to convert a Blob to a base64 string
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64string = reader.result as string;
      // remove data url prefix: "data:audio/wav;base64,"
      resolve(base64string.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper to write a string to a DataView
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Encodes raw audio samples (Float32) into a WAV file blob
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Audio format 1 is PCM
  view.setUint16(22, 1, true); // 1 channel (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16 bits per sample
  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write PCM data
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}


// Extracts audio from a video/audio file, chunks it, and encodes it to WAV format.
export function extractAudioChunks(file: File, chunkDuration: number): Promise<AudioChunkData[]> {
  return new Promise(async (resolve, reject) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const chunks: AudioChunkData[] = [];

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const totalDuration = audioBuffer.duration;
      const sampleRate = audioBuffer.sampleRate;

      for (let startTime = 0; startTime < totalDuration; startTime += chunkDuration) {
          const endTime = Math.min(startTime + chunkDuration, totalDuration);
          const currentDuration = endTime - startTime;

          const startOffset = Math.floor(startTime * sampleRate);
          const endOffset = Math.floor(endTime * sampleRate);
          const frameCount = endOffset - startOffset;

          // Create a new AudioBuffer for the chunk and downmix to mono
          const monoChannel = new Float32Array(frameCount);
          for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
              const channelData = audioBuffer.getChannelData(c).subarray(startOffset, endOffset);
              for (let i = 0; i < channelData.length; i++) {
                  monoChannel[i] += channelData[i] / audioBuffer.numberOfChannels;
              }
          }
          
          const wavBlob = encodeWav(monoChannel, sampleRate);
          const base64 = await blobToBase64(wavBlob);

          chunks.push({ 
            startTime, 
            duration: currentDuration, 
            base64 
          });
      }

      resolve(chunks);
    } catch (e) {
      console.error(e);
      reject(new Error('Failed to process audio. The file format may be unsupported or corrupted.'));
    } finally {
      audioContext.close();
    }
  });
}
