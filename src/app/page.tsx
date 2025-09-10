
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, ArrowUp, Trash2 } from 'lucide-react';
import { translateText } from '@/ai/flows/translate-text';
import { detectLanguage } from '@/ai/flows/detect-language';
import { clearTranslations } from '@/ai/flows/clear-translations';
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

// Define a constant for the local cache lifetime (1 day in milliseconds).
const LOCAL_CACHE_STALE_MS =
  parseInt(process.env.NEXT_PUBLIC_LOCAL_CACHE_STALE_MS || '', 10) || 86400000;

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    seedDatabaseIfNeeded();
  }, []);

  const handleTranslate = useCallback(async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput) return;

    setIsLoading(true);
    setOutputText('');

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
          setOutputText(cached.translatedText);
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
      setOutputText(result.translatedText);
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

  const handleClearFirestore = async () => {
    try {
      const result = await clearTranslations();
      toast({
        title: 'Firestore Cache Cleared',
        description: `${result.deletedCount} translation(s) have been deleted from the server.`,
      });
    } catch (error) {
      console.error('Error clearing Firestore:', error);
      toast({
        title: 'Clear Failed',
        description: 'An error occurred while clearing the Firestore cache.',
        variant: 'destructive',
      });
    }
  };

  return (
    <TooltipProvider>
      <div className="dark min-h-screen w-full bg-gradient-to-b from-[#1c1c1e] via-[#1c1c1e] to-[#1d2a57] text-white flex flex-col font-body antialiased">
        <main className="flex-1 flex flex-col items-center justify-between p-4 gap-4 relative">
          {/* Output Area */}
          <div className="w-full max-w-2xl flex-1 flex flex-col gap-4 justify-center">
            <div className="relative h-full">
              <Textarea
                placeholder="Translation"
                readOnly
                className="bg-transparent backdrop-blur-md border-none rounded-2xl h-full text-lg resize-none w-full focus-visible:ring-0"
                value={outputText}
              />
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-2xl">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Translating...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Bar */}
          <div className="w-full max-w-2xl bg-black/20 backdrop-blur-lg border border-white/20 rounded-3xl p-2 flex items-end gap-2">
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-white/10 rounded-full w-12 h-12 hover:bg-white/20 text-white shrink-0"
                  onClick={handleTranslate}
                  disabled={isLoading || !inputText.trim()}
                >
                  <ArrowUp size={24} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Translate</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
