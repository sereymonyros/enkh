
'use client';

import { useState, useCallback, useEffect } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { translateText } from '@/ai/flows/translate-text';
import { getTranslationFromDb, saveTranslationToDb } from '@/lib/db';
import { AngkorWatIcon } from '@/components/icons/angkor-wat-icon';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { seedDatabaseIfNeeded } from '@/lib/seeder';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'km', label: 'Khmer' },
];

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export default function Home() {
  const [sourceLang, setSourceLang] = useState<'en' | 'km'>('en');
  const [targetLang, setTargetLang] = useState<'en' | 'km'>('km');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // --- NEW: This useEffect hook runs the database seeder ---
  // It runs only once when the component is first mounted on the client.
  useEffect(() => {
    // Call the function that handles the seeding logic.
    // This function will itself check if seeding is needed, so it's safe to call on every page load.
    seedDatabaseIfNeeded();
  }, []); // The empty dependency array [] ensures this runs only once.

  const handleTranslate = useCallback(async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput) return;

    setIsLoading(true);
    setOutputText('');

    const normalizedInput = normalizeText(trimmedInput);

    try {
      console.log('CACHE CHECK: Checking IndexedDB...');
      const cached = await getTranslationFromDb(
        normalizedInput,
        sourceLang,
        targetLang
      );
      if (cached) {
        setOutputText(cached);
        setIsLoading(false);
        console.log('CACHE HIT: Found translation in IndexedDB.');
        return;
      }

      console.log(
        'CACHE MISS: Not in IndexedDB. Checking server (Firestore/API)...'
      );

      const result = await translateText({
        text: trimmedInput,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      });
      setOutputText(result.translatedText);

      console.log('CACHE WRITE: Saving new translation to IndexedDB.');
      await saveTranslationToDb(
        normalizedInput,
        sourceLang,
        targetLang,
        result.translatedText
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
  }, [inputText, sourceLang, targetLang, toast]);

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(outputText);
    setOutputText(inputText);
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex-1 w-full">
              <Label htmlFor="source-lang" className="text-muted-foreground">
                From
              </Label>
              <Select
                value={sourceLang}
                onValueChange={(value) => setSourceLang(value as 'en' | 'km')}
              >
                <SelectTrigger id="source-lang" className="w-full">
                  <SelectValue placeholder="Select source language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="mt-4 sm:mt-5 self-center"
              onClick={handleSwapLanguages}
              aria-label="Swap languages"
            >
              <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
            </Button>

            <div className="flex-1 w-full">
              <Label htmlFor="target-lang" className="text-muted-foreground">
                To
              </Label>
              <Select
                value={targetLang}
                onValueChange={(value) => setTargetLang(value as 'en' | 'km')}
              >
                <SelectTrigger id="target-lang" className="w-full">
                  <SelectValue placeholder="Select target language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
      </footer>
    </main>
  );
}
