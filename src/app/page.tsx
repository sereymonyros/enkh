
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Sparkles, Camera, Mic, Send } from 'lucide-react';
import { translateText } from '@/ai/flows/translate-text';
import { detectLanguage } from '@/ai/flows/detect-language';
import { getTranslationFromDb, saveTranslationToDb } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { seedDatabaseIfNeeded } from '@/lib/seeder';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

// Define a type for a single history entry
type HistoryItem = {
  id: number;
  originalText: string;
  translatedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
};

// Define a constant for the local cache lifetime (1 day in milliseconds).
const LOCAL_CACHE_STALE_MS =
  parseInt(process.env.NEXT_PUBLIC_LOCAL_CACHE_STALE_MS || '', 10) || 86400000;

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [translationHistory, setTranslationHistory] = useState<HistoryItem[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    seedDatabaseIfNeeded();
  }, []);

  const handleTranslate = useCallback(async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput) return;

    setIsLoading(true);

    try {
      // --- Step 1: Detect the language ---
      console.log('1. DETECT: Detecting input language...');
      const detectionResult = await detectLanguage({ text: trimmedInput });
      const currentDetectedLang = detectionResult.language;

      if (currentDetectedLang === 'unknown') {
        toast({
          title: 'Language Not Detected',
          description:
            'Could not determine the input language. Please use English or Khmer.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      console.log(`   ✅ DETECTED: Language is '${currentDetectedLang}'.`);

      const sourceLang = currentDetectedLang;
      const targetLang = sourceLang === 'en' ? 'km' : 'en';
      const normalizedInput = normalizeText(trimmedInput);

      // --- LAYER 2: CHECK INDEXEDDB (LOCAL CACHE) ---
      console.log('2. LOCAL CHECK: Checking for translation in IndexedDB...');
      const cached = await getTranslationFromDb(
        normalizedInput,
        sourceLang,
        targetLang
      );

      if (cached) {
        const age = Date.now() - cached.createdAt.getTime();
        if (age < LOCAL_CACHE_STALE_MS) {
          const newHistoryItem: HistoryItem = {
            id: Date.now(),
            originalText: trimmedInput,
            translatedText: cached.translatedText,
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
          };
          setTranslationHistory(prev => [newHistoryItem, ...prev]);
          setInputText('');
          setIsLoading(false);
          console.log(
            '   ✅ LOCAL HIT (FRESH): Found fresh translation in IndexedDB. Flow complete.'
          );
          return;
        } else {
          console.log(
            '   ⚠️ LOCAL HIT (STALE): Translation is older than 1 day. Will re-validate with server.'
          );
        }
      } else {
        console.log('   ❌ LOCAL MISS: Not found in IndexedDB.');
      }

      // --- LAYER 3: CALL SERVER (FIRESTORE/API) ---
      console.log('3. SERVER CHECK: Calling server-side flow...');
      const result = await translateText({
        text: trimmedInput,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      });

      const newHistoryItem: HistoryItem = {
        id: Date.now(),
        originalText: trimmedInput,
        translatedText: result.translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      };

      setTranslationHistory(prev => [newHistoryItem, ...prev]);
      setInputText(''); // Clear input after successful translation

      // --- CACHE WRITE: SAVE TO INDEXEDDB FOR FUTURE OFFLINE USE ---
      console.log(
        '4. LOCAL WRITE: Saving/updating translation in IndexedDB symmetrically.'
      );
      const normalizedTranslatedText = normalizeText(result.translatedText);
      // Save the forward translation
      await saveTranslationToDb(
        normalizedInput,
        sourceLang,
        targetLang,
        result.translatedText
      );
      // Save the reverse translation
      await saveTranslationToDb(
        normalizedTranslatedText,
        targetLang,
        sourceLang,
        trimmedInput // The original input is the reverse translation
      );
    } catch (error) {
      console.error('Translation error:', error);
      toast({
        title: 'Translation Failed',
        description:
          'An error occurred while translating the text. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputText, toast]);

  return (
    <TooltipProvider>
      <div className="dark min-h-screen w-full bg-[#131314] text-white flex flex-col font-body antialiased">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 relative overflow-y-auto">
          <ScrollArea className="w-full max-w-2xl flex-1">
            <div className="flex flex-col-reverse gap-6 pb-4">
              {/* History */}
              {translationHistory.map(item => (
                <div key={item.id} className="w-full">
                  <div className="flex flex-col gap-4">
                    {/* User's query */}
                    <div className="flex justify-end">
                      <div className="bg-[#1e1f20] rounded-2xl p-3 max-w-[80%]">
                        <p className="text-lg text-white/80">{item.originalText}</p>
                      </div>
                    </div>
                    {/* AI's response */}
                    <div className="flex justify-start items-start gap-3">
                       <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
                       <p className="text-lg">{item.translatedText}</p>
                    </div>
                  </div>
                </div>
              ))}
               {isLoading && (
                 <div className="w-full">
                    <div className="flex flex-col gap-4">
                      {/* User's query */}
                      <div className="flex justify-end">
                        <div className="bg-[#1e1f20] rounded-2xl p-3 max-w-[80%]">
                           <p className="text-lg text-white/80">{inputText}</p>
                        </div>
                      </div>
                      {/* AI's response placeholder */}
                      <div className="flex justify-start items-start gap-3">
                         <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1 animate-spin" />
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </ScrollArea>
          </main>
          {/* Input Bar */}
          <div className="w-full max-w-2xl mx-auto px-4 pb-4 flex flex-col gap-3">
            <div className="bg-[#1e1f20] border border-white/20 rounded-full p-2 flex items-center gap-2">
              <Textarea
                placeholder="Enter text to translate..."
                className="bg-transparent border-none text-lg resize-none flex-1 focus-visible:ring-0"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleTranslate();
                  }
                }}
              />
            </div>
             <div className="flex justify-center items-center gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="bg-[#1e1f20] hover:bg-white/20 text-white rounded-full w-12 h-12"
                      disabled={true}
                    >
                      <Camera size={24} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Translate from image (coming soon)</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                     <Button
                      variant="ghost"
                      size="icon"
                      className="bg-[#1e1f20] hover:bg-white/20 text-white rounded-full w-12 h-12"
                      disabled={true}
                    >
                      <Mic size={24} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Translate from speech (coming soon)</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-12 h-12"
                      onClick={handleTranslate}
                      disabled={isLoading || !inputText.trim()}
                    >
                      <Send size={24} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Translate</p>
                  </TooltipContent>
                </Tooltip>
              </div>
          </div>
      </div>
    </TooltipProvider>
  );
}
