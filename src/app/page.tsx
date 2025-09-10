
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, Languages, Trash2, ArrowRight } from 'lucide-react';
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
// Fallback to 1 day if the environment variable is not set.
const LOCAL_CACHE_STALE_MS =
  parseInt(process.env.NEXT_PUBLIC_LOCAL_CACHE_STALE_MS || '', 10) || 86400000;

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [detectedLang, setDetectedLang] = useState<'en' | 'km' | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    seedDatabaseIfNeeded();
  }, []);

  const handleTranslate = useCallback(async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput) return;

    setIsLoading(true);
    setOutputText('');
    setDetectedLang(null);

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
      setDetectedLang(currentDetectedLang);

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

  const getLanguageName = (langCode: 'en' | 'km' | null) => {
    if (langCode === 'en') return 'English';
    if (langCode === 'km') return 'Khmer';
    return '';
  };
  
  const sourceLanguageName = getLanguageName(detectedLang);
  const targetLanguageName = getLanguageName(detectedLang === 'en' ? 'km' : 'en');


  return (
    <TooltipProvider>
      <div className="dark min-h-screen w-full bg-gradient-to-b from-[#1c1c1e] via-[#1c1c1e] to-[#1d2a57] text-white flex flex-col font-body antialiased">
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4 relative">
          {/* Top-down text areas */}
          <div className="w-full max-w-2xl flex-1 flex flex-col gap-4 justify-center">
            {/* Output Text Area */}
            <div className="relative">
              <Textarea
                placeholder="Translation"
                readOnly
                className="bg-black/20 backdrop-blur-md border border-white/20 rounded-2xl min-h-[200px] text-lg resize-none w-full"
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

            {/* Input Text Area */}
            <div className="relative">
               <Textarea
                placeholder="Enter text to translate..."
                className="bg-black/20 backdrop-blur-md border border-white/20 rounded-2xl min-h-[200px] text-lg resize-none w-full focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-white/50"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
               {detectedLang && (
                <div className="absolute bottom-3 right-3 text-white/50 text-xs flex items-center gap-1">
                  <span>{sourceLanguageName}</span>
                  <ArrowRight size={12} />
                  <span>{targetLanguageName}</span>
                </div>
              )}
            </div>
          </div>
        </main>
        {/* Fixed bottom action bar */}
        <footer className="sticky bottom-0 left-0 right-0 w-full flex justify-center p-4 bg-gradient-to-t from-black/50 to-transparent">
          <div className="flex items-center gap-4 bg-black/20 backdrop-blur-lg border border-white/20 rounded-full p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-transparent rounded-full w-14 h-14 hover:bg-white/10 text-white"
                  onClick={handleTranslate}
                  disabled={isLoading || !inputText.trim()}
                >
                  <Languages size={28} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Translate</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-transparent rounded-full w-14 h-14 hover:bg-white/10 text-white"
                  onClick={handleClearFirestore}
                >
                  <Trash2 size={28} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear Server Cache (Dev)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
