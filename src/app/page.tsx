
"use client";

import { useState, useCallback } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { translateText } from "@/ai/flows/translate-text";
// Import the new IndexedDB helper functions.
import { getTranslationFromDb, saveTranslationToDb } from "@/lib/db";
import { AngkorWatIcon } from "@/components/icons/angkor-wat-icon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const languages = [
  { value: "en", label: "English" },
  { value: "km", label: "Khmer" },
];

// This function converts the input text to lowercase and removes leading/trailing spaces.
// This ensures that "  Hello" and "hello" are treated as the same for caching purposes.
const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export default function Home() {
  const [sourceLang, setSourceLang] = useState<"en" | "km">("en");
  const [targetLang, setTargetLang] = useState<"en" | "km">("km");
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleTranslate = useCallback(async () => {
    // Exit early if there's no text to translate.
    const trimmedInput = inputText.trim();
    if (!trimmedInput) return;

    setIsLoading(true);
    setOutputText("");

    // Normalize the input text for consistent caching.
    const normalizedInput = normalizeText(trimmedInput);

    try {
      // --- This is the new Offline-First Caching Flow ---
      // STEP 1: Check the local browser database (IndexedDB) first.
      // This is the fastest check and works entirely offline.
      console.log("CACHE CHECK: Checking IndexedDB...");
      const cached = await getTranslationFromDb(normalizedInput, sourceLang, targetLang);
      if (cached) {
        // If a translation is found locally, display it and we're done. No network needed.
        setOutputText(cached);
        setIsLoading(false);
        console.log("CACHE HIT: Found translation in IndexedDB.");
        return;
      }

      console.log("CACHE MISS: Not in IndexedDB. Checking server (Firestore/API)...");
      // STEP 2: If not in IndexedDB, call the server-side flow.
      // This flow will first check Firestore (the shared cache), and if it's not there,
      // it will finally call the AI translation API.
      const result = await translateText({
        text: trimmedInput, // Send original trimmed text to the server
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      });
      setOutputText(result.translatedText);

      // STEP 3: Save the new translation to the local database for next time.
      // This "populates" our offline cache.
      console.log("CACHE WRITE: Saving new translation to IndexedDB.");
      await saveTranslationToDb(
        normalizedInput,
        sourceLang,
        targetLang,
        result.translatedText
      );
    } catch (error) {
      // If any step in the process fails, show an error message.
      console.error("Translation error:", error);
      toast({
        title: "Translation Failed",
        description:
          "An error occurred while translating the text. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Ensure the loading spinner is turned off, no matter what.
      setIsLoading(false);
    }
  }, [inputText, sourceLang, targetLang, toast]);

  // This function swaps the source and target languages, and the input and output text.
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
                onValueChange={(value) => setSourceLang(value as "en" | "km")}
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
                onValueChange={(value) => setTargetLang(value as "en" | "km")}
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
              "Translate"
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
