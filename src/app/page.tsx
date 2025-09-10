
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, Send, Pencil, Check, X, Volume2, Copy } from 'lucide-react';
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
  parseInt(process.env.NEXT_PUBLIC_LOCAL_CACHE_STALE_MS || '', 10) || 864000;

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export default function Home() {
  const [inputText, setInputText] = useState('Hello Cambodia');
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
    setTimeout(() => {
        scrollToBottom();
    }, 0);
  }, [translationHistory, isLoading]);

  const handleTranslate = useCallback(async (textToTranslate: string, isEditing = false, editedMessageId: number | null = null) => {
    const trimmedInput = textToTranslate.trim();
    if (!trimmedInput) {
      if (!isEditing) {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 820);
      }
      return;
    }

    setIsLoading(true);
    if (!isEditing) {
        setInputText('Hello Cambodia');
    }
    setEditingItemId(null);

    // If it's a new message, add the user message to history.
    if (!isEditing) {
        const userMessage: HistoryItem = {
          id: Date.now(),
          originalText: trimmedInput,
          translatedText: '', // No translation for user message
          sourceLanguage: 'en', // Placeholder, will be detected
          targetLanguage: 'km', // Placeholder
          isUser: true,
        };
        // Use a function for setting state to get the most recent state
        setTranslationHistory(prev => [...prev, userMessage]);
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
        if (!isEditing) {
            setTranslationHistory(prev => prev.slice(0, -1));
        } else if (editedMessageId) {
             // If edit fails, revert the change
            setTranslationHistory(prev => {
                const messageIndex = prev.findIndex(item => item.id === editedMessageId);
                if (messageIndex !== -1 && prev[messageIndex + 1]) {
                    const originalUserMessage = translationHistory.find(item => item.id === editedMessageId);
                     if(originalUserMessage) {
                        const newHistory = [...prev];
                        newHistory[messageIndex] = originalUserMessage; // Revert user message
                        // We assume the AI message is next, but ideally it should also be reverted
                        // For now, let's just revert the user's text
                        return newHistory;
                    }
                }
                return prev;
            })
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

      let translatedText: string;

      if (cached) {
        const age = Date.now() - cached.createdAt.getTime();
        if (age < LOCAL_CACHE_STALE_MS) {
           console.log( '   ✅ LOCAL HIT (FRESH): Found fresh translation in IndexedDB. Flow complete.');
           translatedText = cached.translatedText;
        } else {
            console.log( '   ⚠️ LOCAL HIT (STALE): Translation is older than 1 day. Will re-validate with server.');
            const result = await translateText({ text: trimmedInput, sourceLanguage: sourceLang, targetLanguage: targetLang });
            translatedText = result.translatedText;
        }
      } else {
        console.log('   ❌ LOCAL MISS: Not found in IndexedDB.');
         // --- LAYER 3: CALL SERVER (FIRESTORE/API) ---
        console.log('3. SERVER CHECK: Calling server-side flow...');
        const result = await translateText({ text: trimmedInput, sourceLanguage: sourceLang, targetLanguage: targetLang });
        translatedText = result.translatedText;

         // --- CACHE WRITE: SAVE TO INDEXEDDB FOR FUTURE OFFLINE USE ---
        console.log('4. LOCAL WRITE: Saving/updating translation in IndexedDB symmetrically.');
        const normalizedTranslatedText = normalizeText(translatedText);
        await saveTranslationToDb(normalizedInput, sourceLang, targetLang, translatedText);
        await saveTranslationToDb(normalizedTranslatedText, targetLang, sourceLang, trimmedInput);
      }
      
      const aiMessage: HistoryItem = {
        id: isEditing && editedMessageId ? editedMessageId + 1 : Date.now() + 1, // Ensure unique ID
        originalText: trimmedInput,
        translatedText: translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        isUser: false,
      };

      if(isEditing){
         setTranslationHistory(prev => {
            if (!editedMessageId) return prev;
            const messageIndex = prev.findIndex(item => item.id === editedMessageId);
            if (messageIndex === -1) return prev;
            
            const newHistory = [...prev];
            // The AI message should be at the next index
            newHistory[messageIndex + 1] = aiMessage; 
            return newHistory;
        });
      } else {
        setTranslationHistory(prev => [...prev, aiMessage]);
      }


    } catch (error) {
      console.error('Translation error:', error);
      toast({
        title: 'Translation Failed',
        description:
          'An error occurred while translating the text. Please try again.',
        variant: 'destructive',
      });
      if (!isEditing) {
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
    if (editingItemId === null) return;

    // Find the index of the user message being edited
    const messageIndex = translationHistory.findIndex(item => item.id === editingItemId);
    if (messageIndex === -1 || !translationHistory[messageIndex + 1]) {
        cancelEditing();
        return;
    };
    
    const newHistory = [...translationHistory];

    // Update the user message in place
    newHistory[messageIndex] = {
        ...newHistory[messageIndex],
        originalText: editedText,
    };

    // Mark the following AI message as loading
    newHistory[messageIndex + 1] = {
        ...newHistory[messageIndex + 1],
        translatedText: '...', // Loading indicator
    };
    
    setTranslationHistory(newHistory);
    handleTranslate(editedText, true, editingItemId);

    setEditingItemId(null);
    setEditedText("");
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Copied to clipboard!' });
    }, (err) => {
      console.error('Could not copy text: ', err);
      toast({ title: 'Failed to copy', variant: 'destructive' });
    });
  };


  const renderHistoryItem = (item: HistoryItem, index: number) => {
    if (item.isUser) {
        const isEditing = editingItemId === item.id;
        return (
          <div key={item.id} className="group flex justify-end items-center gap-2">
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8" onClick={() => startEditing(item)}>
                 <Pencil size={14} />
            </Button>
            <div className="bg-[#1e1f20] rounded-t-2xl rounded-bl-2xl p-3 max-w-[80%]">
             {isEditing ? (
                 <div className="relative">
                   <Textarea
                     value={editedText}
                     onChange={(e) => setEditedText(e.target.value)}
                     className="bg-transparent border-transparent text-lg resize-none flex-1 focus-visible:ring-0 text-white/80 p-0 pr-12"
                     autoFocus
                     onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitEdit();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEditing();
                      }
                    }}
                   />
                   <div className="absolute top-0 right-0 flex items-center gap-1">
                     <Button variant="ghost" size="icon" onClick={cancelEditing} className="w-8 h-8 shrink-0">
                       <X size={14} />
                     </Button>
                     <Button variant="ghost" size="icon" onClick={submitEdit} className="w-8 h-8 shrink-0">
                       <Check size={14} />
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
      const isBeingEdited = item.translatedText === '...';

      if (isBeingEdited) {
        return (
          <div key={item.id} className="flex justify-start items-start gap-3">
            <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1 animate-spin" />
          </div>
        );
      }

      if (isLoading && index === translationHistory.length - 1) {
          const prevItem = translationHistory[index - 1];
          if (prevItem && prevItem.isUser) {
            return null;
          }
      }

      return (
        <div key={item.id} className="group flex justify-start items-start gap-2 max-w-[80%]">
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-2">
               <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0" />
               <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8" onClick={() => handleCopyToClipboard(item.translatedText)}>
                  <Copy size={14} />
               </Button>
               <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8">
                  <Volume2 size={14} />
               </Button>
            </div>
             <div className="bg-[#1e1f20] rounded-tr-2xl rounded-b-2xl p-3">
                <p className="text-lg">{item.translatedText}</p>
            </div>
          </div>
        </div>
      );
    }
  };


  return (
    <TooltipProvider>
      <div className="dark min-h-screen w-full bg-gemini-gradient text-white flex flex-col font-body antialiased">
        <ScrollArea className="w-full max-w-2xl mx-auto flex-1 px-4" viewportRef={scrollAreaViewportRef}>
          <div className="flex flex-col gap-6 pb-48 pt-4">
            {/* History */}
            {translationHistory.map(renderHistoryItem)}

            {/* Loading Indicator for new messages */}
            {isLoading && (translationHistory.length === 0 || translationHistory[translationHistory.length-1]?.isUser) && (
                <div className="flex justify-start items-start gap-3">
                <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1 animate-spin" />
                </div>
            )}
          </div>
        </ScrollArea>
        {/* Input Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-10">
          <div className="w-full max-w-2xl mx-auto px-4 py-4 flex flex-col gap-3">
            <div className={cn(
                "border border-blue-600 rounded-full p-2 flex items-center gap-2",
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
                      className="bg-[#1e1f20] text-white rounded-full w-12 h-12"
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
      </div>
    </TooltipProvider>
  );
}

    