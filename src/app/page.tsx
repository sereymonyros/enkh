
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, Send, Pencil, Check, X } from 'lucide-react';
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
import { cn } from '@/lib/utils';


// Define a type for a single history entry
type HistoryItem = {
  id: number;
  originalText: string;
  translatedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
  isUser: boolean;
};

// Define a constant for the local cache lifetime (1 day in milliseconds).
const LOCAL_CACHE_STALE_MS =
  parseInt(process.env.NEXT_PUBLIC_LOCAL_CACHE_STALE_MS || '', 10) || 8640000;

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [translationHistory, setTranslationHistory] = useState<HistoryItem[]>([]);
  const { toast } = useToast();
  const [isShaking, setIsShaking] = useState(false);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editedText, setEditedText] = useState('');

  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollAreaViewportRef.current) {
      scrollAreaViewportRef.current.scrollTop =
        scrollAreaViewportRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    seedDatabaseIfNeeded();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [translationHistory, isLoading]);

  const handleTranslate = useCallback(async (textToTranslate: string, existingItemId?: number) => {
    const trimmedInput = textToTranslate.trim();
    if (!trimmedInput) {
       setIsShaking(true);
      setTimeout(() => setIsShaking(false), 820); // Duration of the shake animation
      return;
    }

    setIsLoading(true);
    setInputText(''); // Clear input immediately
    setEditingItemId(null); // Exit editing mode

    // If it's a new message, add user's message to history.
    // If it's an edit, we'll update it later, but remove the old AI response.
    if (!existingItemId) {
        const userMessage: HistoryItem = {
          id: Date.now(),
          originalText: trimmedInput,
          translatedText: '', // No translation for user message
          sourceLanguage: 'en', // Placeholder, will be detected
          targetLanguage: 'km', // Placeholder
          isUser: true,
        };
        setTranslationHistory(prev => [...prev, userMessage]);
    } else {
        // Find the index of the user message and the AI message that follows it
        const userMessageIndex = translationHistory.findIndex(item => item.id === existingItemId);
        if (userMessageIndex !== -1) {
            // Update the original text
            const updatedHistory = [...translationHistory];
            updatedHistory[userMessageIndex].originalText = trimmedInput;
            
            // Remove the old AI response if it exists
            if (userMessageIndex + 1 < updatedHistory.length && !updatedHistory[userMessageIndex + 1].isUser) {
                updatedHistory.splice(userMessageIndex + 1, 1);
            }

            setTranslationHistory(updatedHistory);
        }
    }


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
        if (!existingItemId) {
            setTranslationHistory(prev => prev.slice(0, -1));
        }
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
            const aiMessage: HistoryItem = {
            id: Date.now() + 1, // Ensure unique ID
            originalText: trimmedInput,
            translatedText: cached.translatedText,
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
            isUser: false,
          };
          setTranslationHistory(prev => [...prev, aiMessage]);
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
        id: Date.now() + 1,
        originalText: trimmedInput,
        translatedText: result.translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        isUser: false,
      };

      setTranslationHistory(prev => [...prev, newHistoryItem]);

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
      // Also remove user message on error
      if (!existingItemId) {
        setTranslationHistory(prev => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast, translationHistory]);


  const startEditing = (item: HistoryItem) => {
    setEditingItemId(item.id);
    setEditedText(item.originalText);
  };

  const cancelEditing = () => {
    setEditingItemId(null);
    setEditedText('');
  };

  const submitEdit = () => {
    if (editingItemId) {
      handleTranslate(editedText, editingItemId);
    }
  };


  const renderHistoryItem = (item: HistoryItem, index: number) => {
    if (item.isUser) {
        const isEditing = editingItemId === item.id;
        return (
          <div key={item.id} className="group flex justify-end items-center gap-2">
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8" onClick={() => startEditing(item)}>
                 <Pencil size={18} />
            </Button>
            <div className="bg-[#1e1f20] rounded-t-2xl rounded-bl-2xl p-3 max-w-[80%]">
             {isEditing ? (
                <div className="flex items-center justify-between gap-4">
                   <Textarea
                     value={editedText}
                     onChange={(e) => setEditedText(e.target.value)}
                     className="bg-transparent border-none text-lg resize-none flex-1 focus-visible:ring-0 text-white/80 p-0"
                     autoFocus
                   />
                   <div className="flex items-center gap-2">
                     <Button variant="ghost" size="icon" onClick={cancelEditing} className="w-8 h-8 shrink-0">
                       <X size={18} />
                     </Button>
                     <Button variant="ghost" size="icon" onClick={submitEdit} className="w-8 h-8 shrink-0">
                       <Check size={18} />
                     </Button>
                   </div>
                 </div>
              ) : (
                <p className="text-lg text-white/80">{item.originalText}</p>
              )}
            </div>
          </div>
        );
    } else {
        // Check if the previous message was a user message that is currently loading its translation
        const prevItem = translationHistory[index - 1];
        const isPrevItemLoading = prevItem && prevItem.isUser && isLoading && index === translationHistory.length -1;
        
        if (isPrevItemLoading) {
            return null; // Don't render the AI bubble if the previous user message is what's loading
        }

      return (
        <div key={item.id} className="flex justify-start items-start gap-3">
           <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
           <p className="text-lg">{item.translatedText}</p>
        </div>
      );
    }
  };


  return (
    <TooltipProvider>
      <div className="dark min-h-screen w-full bg-[#131314] text-white flex flex-col font-body antialiased">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 relative overflow-y-auto">
           <ScrollArea className="w-full max-w-2xl flex-1" viewportRef={scrollAreaViewportRef}>
             <div className="flex flex-col gap-6 pb-4">
              {/* History */}
              {translationHistory.map(renderHistoryItem)}

              {/* Loading Indicator */}
              {isLoading && (translationHistory.length === 0 || translationHistory[translationHistory.length-1]?.isUser) && (
                 <div className="flex justify-start items-start gap-3">
                   <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1 animate-spin" />
                 </div>
              )}
            </div>
          </ScrollArea>
          </main>
          {/* Input Bar */}
           <div className="w-full max-w-2xl mx-auto px-4 pb-4 flex flex-col gap-3">
            <div className={cn(
                "bg-[#1e1f20] border border-blue-600 rounded-full p-2 flex items-center gap-2",
                isShaking ? 'animate-shake' : ''
              )}>
              <Textarea
                placeholder="Enter text to translate..."
                className="bg-transparent border-none text-lg resize-none flex-1 focus-visible:ring-0"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleTranslate(inputText);
                  }
                }}
                disabled={editingItemId !== null}
              />
            </div>
             <div className="flex justify-center items-center gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="bg-[#1e1f20] hover:bg-[#1e1f20] text-white rounded-full w-12 h-12"
                      onClick={() => handleTranslate(inputText)}
                      disabled={isLoading || editingItemId !== null}
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

    
