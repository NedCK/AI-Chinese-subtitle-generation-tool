import type { AudioChunkData } from '../types';

// This string contains the entire code for our Web Worker.
// By creating the worker from a Blob URL, we avoid needing a separate file.
const workerCode = `
  // --- Helper Functions (self-contained in worker) ---

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64string = reader.result;
        // remove data url prefix: "data:audio/wav;base64,"
        resolve(base64string.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
  
  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Audio format 1 is PCM
    view.setUint16(22, 1, true); // 1 channel (mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // 16 bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  // --- Main Extraction Logic ---
  async function extract(file, chunkDuration) {
    const SILENCE_THRESHOLD = 0.01;
    // In a worker, 'self' is used instead of 'window'
    const audioContext = new (self.AudioContext || self.webkitAudioContext)();
    const chunks = [];
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const totalDuration = audioBuffer.duration;
      const sampleRate = audioBuffer.sampleRate;

      for (let startTime = 0; startTime < totalDuration; startTime += chunkDuration) {
        const endTime = Math.min(startTime + chunkDuration, totalDuration);
        const currentDuration = endTime - startTime;
        if (currentDuration < 0.1) continue;

        const startOffset = Math.floor(startTime * sampleRate);
        const endOffset = Math.floor(endTime * sampleRate);
        const frameCount = endOffset - startOffset;

        const monoChannel = new Float32Array(frameCount);
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
          const channelData = audioBuffer.getChannelData(c).subarray(startOffset, endOffset);
          for (let i = 0; i < channelData.length; i++) {
            monoChannel[i] += channelData[i] / audioBuffer.numberOfChannels;
          }
        }

        let isSilent = true;
        for (let i = 0; i < monoChannel.length; i++) {
          if (Math.abs(monoChannel[i]) > SILENCE_THRESHOLD) {
            isSilent = false;
            break;
          }
        }
        if (isSilent) continue;

        const wavBlob = encodeWav(monoChannel, sampleRate);
        const base64 = await blobToBase64(wavBlob);
        chunks.push({ startTime, duration: currentDuration, base64 });
      }
      return chunks;
    } finally {
      audioContext.close();
    }
  }

  // --- Worker Event Listener ---
  self.onmessage = async (event) => {
    const { file, chunkDuration } = event.data;
    try {
      const chunks = await extract(file, chunkDuration);
      self.postMessage({ type: 'result', chunks });
    } catch (e) {
      const error = e instanceof Error ? e : new Error('Worker failed to process audio.');
      self.postMessage({ type: 'error', message: error.message });
    }
  };
`;

/**
 * Extracts audio from a video/audio file, chunks it, and encodes it to WAV format
 * using an in-memory Web Worker to avoid blocking the main thread.
 * 
 * @param file The video or audio file to process.
 * @param chunkDuration The desired duration of each audio chunk in seconds.
 * @returns A promise that resolves with an array of audio chunk data.
 */
export function extractAudioChunks(file: File, chunkDuration: number): Promise<AudioChunkData[]> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };

    worker.onmessage = (event: MessageEvent<{ type: 'result' | 'error', chunks?: AudioChunkData[], message?: string }>) => {
      if (event.data.type === 'result' && event.data.chunks) {
        resolve(event.data.chunks);
      } else if (event.data.type === 'error') {
        reject(new Error(event.data.message || 'An unknown error occurred in the audio worker.'));
      }
      cleanup();
    };

    worker.onerror = (error) => {
      console.error('Error in audio worker:', error);
      reject(new Error('Failed to process audio in the background. The file may be unsupported or corrupted.'));
      cleanup();
    };

    worker.postMessage({ file, chunkDuration });
  });
}
