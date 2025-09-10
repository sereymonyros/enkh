
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { translateText } from '@/ai/flows/translate-text';
import { detectLanguage } from '@/ai/flows/detect-language';
import { clearTranslations } from '@/ai/flows/clear-translations';
import { getTranslationFromDb, saveTranslationToDb } from '@/lib/db';
import { AngkorWatIcon } from '@/components/icons/angkor-wat-icon';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { seedDatabaseIfNeeded } from '@/lib/seeder';

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
      const detectedLang = detectionResult.language;

      if (detectedLang === 'unknown') {
        toast({
          title: 'Language Not Detected',
          description: 'Could not determine the input language. Please use English or Khmer.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      console.log(`   ✅ DETECTED: Language is '${detectedLang}'.`);


      const sourceLang = detectedLang;
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
          console.log('   ✅ LOCAL HIT (FRESH): Found fresh translation in IndexedDB. Flow complete.');
          return;
        } else {
           console.log('   ⚠️ LOCAL HIT (STALE): Translation is older than 1 day. Will re-validate with server.');
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
      console.log('4. LOCAL WRITE: Saving/updating translation in IndexedDB symmetrically.');
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
    <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4 sm:p-6 md:p-8 font-body">
      <header className="flex items-center gap-4 mb-8">
        <AngkorWatIcon className="w-12 h-12 text-primary" />
        <h1 className="text-5xl font-headline font-bold text-foreground">
          enkh
        </h1>
      </header>

      <Card className="w-full max-w-4xl shadow-2xl rounded-xl">
        <CardHeader>
            <CardTitle className="text-center text-muted-foreground font-normal">
                Translate between English and Khmer
            </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <Textarea
              placeholder="Enter text to translate..."
              className="min-h-[200px] text-base resize-none"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <div className="relative">
              <Textarea
                placeholder="Translation"
                readOnly
                className="min-h-[200px] text-base resize-none bg-secondary/50"
                value={outputText}
              />
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm rounded-md transition-opacity duration-300">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Translating...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full sm:w-auto ml-auto bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={handleTranslate}
            disabled={isLoading || !inputText.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Translating
              </>
            ) : (
              'Translate'
            )}
          </Button>
        </CardFooter>
      </Card>
      <footer className="mt-8 text-center text-muted-foreground text-sm">
        <p>Powered by AI. Translations may not be perfect.</p>
        <div className="mt-4">
          <Button variant="link" size="sm" onClick={handleClearFirestore}>
            Clear Firestore Cache (Dev Tool)
          </Button>
        </div>
      </footer>
    </main>
  );
}
