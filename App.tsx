
import React, { useState, useCallback, useRef } from 'react';
import { generateSubtitleForChunk } from './services/gemini';
import { extractAudioChunks } from './utils/video';
import { formatSrt, formatTimestamp } from './utils/formatters';
import type { SubtitleEntry, AudioChunkData } from './types';
import { FileVideo, Film, CheckCircle, AlertTriangle } from './components/Icons';
import { Spinner } from './components/Spinner';
import { useTranslation } from './i18n';

const App: React.FC = () => {
  const { t, language, setLanguage } = useTranslation();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [subtitles, setSubtitles] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type.startsWith('video/') || file.type.startsWith('audio/'))) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setSubtitles('');
      setError(null);
      setIsCopied(false);
    } else {
      setError(t('errorInvalidFile'));
      setVideoFile(null);
      setVideoUrl('');
    }
  }, [t]);

  const handleGenerateClick = useCallback(async () => {
    if (!videoFile) return;

    setIsLoading(true);
    setError(null);
    setSubtitles('');
    setIsCopied(false);

    try {
      setLoadingMessage(t('loadingStep1'));
      const audioChunks: AudioChunkData[] = await extractAudioChunks(videoFile, 15); // 15-second chunks

      if (audioChunks.length === 0) {
        throw new Error("Could not extract any audio from the file. The file might be silent, too short, or in an unsupported format.");
      }
      
      let allSubtitles: SubtitleEntry[] = [];
      for (let i = 0; i < audioChunks.length; i++) {
          const chunk = audioChunks[i];
          setLoadingMessage(t('loadingStep2', { current: i + 1, total: audioChunks.length }));
          
          const translatedText = await generateSubtitleForChunk(chunk);

          if (translatedText && translatedText.trim()) {
            allSubtitles.push({
              id: 0, // Will be re-numbered by formatSrt
              startTime: formatTimestamp(chunk.startTime),
              endTime: formatTimestamp(chunk.startTime + chunk.duration),
              chineseText: translatedText.trim(),
            });
          }
      }
      
      setLoadingMessage(t('loadingStep3'));
      
      if (allSubtitles.length === 0) {
        throw new Error("The AI model did not return any valid translations. The audio may be silent or contain no clear speech.");
      }

      const formattedSrt = formatSrt(allSubtitles);
      setSubtitles(formattedSrt);

    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during subtitle generation.');
      }
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [videoFile, t]);

  const handleCopy = () => {
    if(subtitles) {
      navigator.clipboard.writeText(subtitles);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const LanguageSwitcher = () => (
    <div className="absolute top-0 right-0 flex items-center space-x-1 p-2">
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          language === 'en' ? 'text-white bg-brand-blue' : 'text-gray-400 hover:bg-gray-700'
        }`}
      >
        English
      </button>
      <span className="text-gray-600">|</span>
      <button
        onClick={() => setLanguage('zh')}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          language === 'zh' ? 'text-white bg-brand-blue' : 'text-gray-400 hover:bg-gray-700'
        }`}
      >
        简体中文
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      <main className="container mx-auto px-4 py-8 md:py-12">
        <header className="relative text-center mb-10">
          <LanguageSwitcher />
          <div className="flex justify-center items-center gap-4 mb-2 pt-8 md:pt-0">
            <Film className="w-10 h-10 text-brand-blue" />
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-300">
              {t('title')}
            </h1>
          </div>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Upload and Preview */}
          <div className="bg-gray-800/50 rounded-2xl p-6 shadow-2xl border border-gray-700">
            <h2 className="text-2xl font-semibold mb-4 text-white">{t('uploadTitle')}</h2>
            
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-3 bg-brand-blue hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105"
            >
              <FileVideo className="w-6 h-6" />
              <span>{videoFile ? t('changeFile') : t('selectFile')}</span>
            </button>
            
            {videoFile && (
               <p className="text-sm text-center mt-3 text-gray-400 truncate">{t('selectedFile', { fileName: videoFile.name })}</p>
            )}

            <div className="mt-6 aspect-video bg-black rounded-lg overflow-hidden border-2 border-gray-700">
              {videoUrl ? (
                <video src={videoUrl} controls className="w-full h-full"></video>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                  <Film className="w-16 h-16 mb-2" />
                  <p>{t('videoPreview')}</p>
                </div>
              )}
            </div>
            
            <button
              onClick={handleGenerateClick}
              disabled={!videoFile || isLoading}
              className="mt-6 w-full bg-teal-500 hover:bg-teal-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <Spinner />
                  <span>{t('generatingButton')}</span>
                </>
              ) : (
                t('generateButton')
              )}
            </button>
          </div>

          {/* Right Column: Subtitles Display */}
          <div className="bg-gray-800/50 rounded-2xl p-6 shadow-2xl border border-gray-700 flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-white">{t('subtitlesTitle')}</h2>
            <div className="flex-grow bg-gray-900 rounded-lg p-4 relative overflow-hidden h-96 lg:h-auto">
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10">
                  <Spinner />
                  <p className="mt-4 text-lg text-gray-300">{loadingMessage}</p>
                </div>
              )}
              {error && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <AlertTriangle className="w-12 h-12 text-red-500 mb-4"/>
                  <p className="text-red-400 font-semibold">{t('errorTitle')}</p>
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              {!isLoading && !error && subtitles && (
                <div className='h-full flex flex-col'>
                  <textarea
                    readOnly
                    value={subtitles}
                    className="w-full h-full bg-transparent text-gray-300 font-mono resize-none border-0 focus:ring-0"
                  />
                  <button 
                    onClick={handleCopy}
                    className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isCopied ? <CheckCircle className="w-5 h-5 text-green-400"/> : null}
                    {isCopied ? t('copiedButton') : t('copyButton')}
                  </button>
                </div>
              )}
              {!isLoading && !error && !subtitles && (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                  <p>{t('subtitlesPreview')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
