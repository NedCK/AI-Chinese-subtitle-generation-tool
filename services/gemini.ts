import { GoogleGenAI } from "@google/genai";
import type { AudioChunkData } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const model = "gemini-2.5-flash";

const prompt = `You are an expert transcriber creating subtitles for Adobe Premiere Pro.
Your task is to transcribe the provided audio clip and translate it into Simplified Chinese, adhering strictly to the following rules:

1.  **Content Context**: The audio is about cutting-edge technology and may contain unclear speech. Use your understanding of the context to produce the most accurate transcription.
2.  **Formatting**: Add a single space between Chinese characters, English words, and numbers. For example: "这是 1 个 Apple".
3.  **Line Breaks**: Generate a single line of text only. Do not use multiple lines.
4.  **Punctuation**: Do not include any punctuation at the beginning or end of the subtitle line. However, necessary punctuation within the line (like commas or dashes) is acceptable.
5.  **Length Limit**: The entire subtitle line must not exceed 18 characters.
6.  **Completeness**: Ensure no content is omitted and the translation accurately reflects the spoken words within the audio clip's timeframe.

Provide ONLY the final, formatted Simplified Chinese translation as a plain text string. If there is no speech, return an empty string.`;


export async function generateSubtitleForChunk(chunk: AudioChunkData): Promise<string> {
  if (!chunk.base64) {
    return "";
  }
  
  try {
    const audioPart = {
      inlineData: {
        mimeType: 'audio/wav',
        data: chunk.base64,
      }
    };

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { text: prompt },
          audioPart
        ]
      },
    });

    return response.text?.trim() || "";

  } catch (error) {
    console.error("Error generating subtitle for chunk with Gemini:", error);
    // Return empty string on error to avoid halting the entire process
    return ""; 
  }
}