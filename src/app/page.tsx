
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, Send, Pencil, Check, X, Volume2, Copy, Database, Menu, StopCircle, MessageSquare, List } from 'lucide-react';
import { translateText } from '@/ai/flows/translate-text';
import { detectLanguage } from '@/ai/flows/detect-language';
import { getTranslationFromDb, saveTranslationToDb } from '@/lib/db';
import { getTranslationFromFirestoreCache } from '@/lib/translation-cache';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { seedDatabaseIfNeeded } from '@/lib/seeder';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarFooter,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { WelcomeToast } from '@/components/welcome-toast';
import { FeedbackForm } from '@/components/feedback-form';
import Link from 'next/link';
import { CacheWarmer } from '@/components/cache-warmer';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFeedbackStore } from '@/lib/feedback-store';
import { FeedbackTable } from '@/components/feedback-table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';


// Define a type for a single history entry
type HistoryItem = {
  id: number;
  originalText: string;
  translatedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
  isUser: boolean;
  fromCache?: boolean;
};

// Define a constant for the local cache lifetime (1 day in milliseconds).
const LOCAL_CACHE_STALE_MS =
  parseInt(process.env.NEXT_PUBLIC_LOCAL_CACHE_STALE_MS || '', 10) || 864000;

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export default function Home() {
  const [inputText, setInputText] = useState('Hello');
  const [isLoading, setIsLoading] = useState(false);
  const [translationHistory, setTranslationHistory] = useState<HistoryItem[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [videoFinished, setVideoFinished] = useState(false);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editedText, setEditedText] = useState('');
  const [historyBeforeEdit, setHistoryBeforeEdit] = useState<HistoryItem[] | null>(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState<number | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackListOpen, setIsFeedbackListOpen] = useState(false);
  const { feedbackCount, setServerFeedback } = useFeedbackStore();

  
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);
  const translationRequestRef = useRef<{ isCancelled: boolean }>({ isCancelled: false });

  const scrollToBottom = () => {
    if (scrollAreaViewportRef.current) {
      scrollAreaViewportRef.current.scrollTop =
        scrollAreaViewportRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    seedDatabaseIfNeeded();
    
    // Listen for real-time updates from Firestore for feedback
    const feedbacksCollection = collection(db, 'feedbacks');
    const q = query(feedbacksCollection, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const feedbacks = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        // Update the feedback store with the full list
        setServerFeedback(feedbacks as any);
    });

    return () => unsubscribe();
  }, [setServerFeedback]);

  useEffect(() => {
    setTimeout(() => {
        scrollToBottom();
    }, 0);
  }, [translationHistory, isLoading]);

  const handleCancel = () => {
    console.log('User cancelled translation.');
    translationRequestRef.current.isCancelled = true;
    setIsLoading(false);

    if (editingItemId && historyBeforeEdit) {
        // If we were editing, restore the history to its pre-edit state.
        setTranslationHistory(historyBeforeEdit);
        setHistoryBeforeEdit(null);
    } else {
        // If it was a new message, remove the user's last message.
        setTranslationHistory(prev => {
            if (prev.length > 0 && prev[prev.length - 1].isUser) {
                return prev.slice(0, -1);
            }
            return prev;
        });
    }
    // Always reset editing state on cancel.
    setEditingItemId(null);
    setEditedText('');
  };

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
    translationRequestRef.current.isCancelled = false;
    if (!isEditing) {
        setInputText('Hello');
    }
  
    // If it's a new message, add the user message to history.
    if (!isEditing) {
        const userMessage: HistoryItem = {
          id: Date.now(),
          originalText: trimmedInput,
          translatedText: '', // No translation for user message
          sourceLanguage: 'en', // Placeholder
          targetLanguage: 'km', // Placeholder
          isUser: true,
        };
        setTranslationHistory(prev => [...prev, userMessage]);
    }
  
    try {
      const normalizedInput = normalizeText(trimmedInput);
      let translatedText: string | null = null;
      let sourceLang: 'en' | 'km' | null = null;
      let targetLang: 'en' | 'km' | null = null;
      let fromCache = false;
  
      // --- OFFLINE-FIRST CACHE CHECK ---
      // This function checks both IndexedDB and Firestore's offline cache for a translation
      // in either direction (en->km or km->en).
      const checkCaches = async (text: string, lang1: 'en' | 'km', lang2: 'en' | 'km') => {
        // Check Layer 1: Private IndexedDB
        const iDbCache = await getTranslationFromDb(text, lang1, lang2);
        if (iDbCache && (Date.now() - iDbCache.createdAt.getTime() < LOCAL_CACHE_STALE_MS)) {
          return { translatedText: iDbCache.translatedText, source: lang1, target: lang2, fromCache: true };
        }
        // Check Layer 2: Shared Firestore Offline Cache
        const firestoreCache = await getTranslationFromFirestoreCache(text, lang1, lang2);
        if (firestoreCache) {
          // If found in shared cache, populate our faster private cache for next time.
          await saveTranslationToDb(text, lang1, lang2, firestoreCache.translatedText);
          return { translatedText: firestoreCache.translatedText, source: lang1, target: lang2, fromCache: true };
        }
        return null;
      };
  
      console.log('1. CACHE CHECK: Checking local caches bidirectionally...');
      const cacheResultEnKm = await checkCaches(normalizedInput, 'en', 'km');
      if (cacheResultEnKm) {
        console.log('   ✅ CACHE HIT: Found en->km translation locally.');
        translatedText = cacheResultEnKm.translatedText;
        sourceLang = 'en';
        targetLang = 'km';
        fromCache = true;
      } else {
        const cacheResultKmEn = await checkCaches(normalizedInput, 'km', 'en');
        if (cacheResultKmEn) {
          console.log('   ✅ CACHE HIT: Found km->en translation locally.');
          translatedText = cacheResultKmEn.translatedText;
          sourceLang = 'km';
          targetLang = 'en';
          fromCache = true;
        } else {
            console.log('   ❌ CACHE MISS: Not found in any local cache.');
        }
      }
  
      // --- ONLINE-ONLY LOGIC ---
      // This block only runs if we had a cache miss and the user is online.
      if (!translatedText) {
        if (!navigator.onLine) {
            toast.error("You are offline", {
                description: "This translation is not in the offline dictionary. Please connect to the internet to translate new words.",
            });
            setTranslationHistory(prev => prev.slice(0, -1)); // Remove the user message
            setIsLoading(false);
            return;
        }

        console.log('2. SERVER CALL: Calling server-side flows...');
        try {
            // Step 2a: Detect the language on the server
            console.log('   -> 2a. DETECT: Detecting input language...');
            const detectionResult = await detectLanguage({ text: trimmedInput });
            if (translationRequestRef.current.isCancelled) return;
            const detectedLang = detectionResult.language;
            
            if (detectedLang === 'unknown') {
                toast.error('Language Not Detected', { description: 'Could not determine the input language. Please use English or Khmer.' });
                throw new Error('Language detection failed'); // Throw to be caught by outer catch block
            }
            console.log(`      ✅ DETECTED: Language is '${detectedLang}'.`);
            
            const detectedSourceLang = detectedLang;
            const detectedTargetLang = detectedLang === 'en' ? 'km' : 'en';

            // Step 2b: Translate the text on the server
            console.log('   -> 2b. TRANSLATE: Calling server-side translation...');
            const result = await translateText({ text: trimmedInput, sourceLanguage: detectedSourceLang, targetLanguage: detectedTargetLang });
            if (translationRequestRef.current.isCancelled) return;
            
            translatedText = result.translatedText;
            fromCache = result.fromCache; // This will be true if the server found it in *its* cache.
            sourceLang = detectedSourceLang;
            targetLang = detectedTargetLang;
            
            // Step 2c: Symmetrically populate local caches for future offline use.
            console.log('3. LOCAL WRITE: Saving/updating translation in IndexedDB symmetrically.');
            await saveTranslationToDb(normalizedInput, sourceLang, targetLang, translatedText);
            await saveTranslationToDb(normalizeText(translatedText), targetLang, sourceLang, trimmedInput);

        } catch (e) {
            // Re-throw to be handled by the final catch block
            throw e;
        }
      }
  
      if (translationRequestRef.current.isCancelled) return;
  
      // If we still don't have a translation or essential language info, something went wrong.
      if (!translatedText || !sourceLang || !targetLang) {
          throw new Error("Translation process failed to produce a result.");
      }
  
      const aiMessage: HistoryItem = {
        id: isEditing && editedMessageId ? editedMessageId + 1 : Date.now() + 1, // Ensure unique ID
        originalText: trimmedInput,
        translatedText: translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        isUser: false,
        fromCache,
      };
  
      if(isEditing && editedMessageId){
         setTranslationHistory(prev => {
            const messageIndex = prev.findIndex(item => item.id === editedMessageId);
            if (messageIndex === -1) return prev;
            const newHistory = [...prev];
            newHistory[messageIndex + 1] = aiMessage;
            return newHistory;
        });
      } else {
        setTranslationHistory(prev => [...prev, aiMessage]);
      }
  
    } catch (error) {
      if (translationRequestRef.current.isCancelled) return;
      console.error('Translation error:', error);
      toast.error('Translation Failed', {
        description: (error as Error).message || 'An error occurred while translating. Please try again.',
      });
       if (isEditing && editedMessageId) {
             setTranslationHistory(prev => {
                const messageIndex = prev.findIndex(item => item.id === editedMessageId);
                if (messageIndex === -1) return prev;
                 const newHistory = [...prev];
                 newHistory[messageIndex + 1] = { ...newHistory[messageIndex + 1], translatedText: 'Translation failed.'};
                 return newHistory;
             });
        } else {
            // Remove the optimistic user message on failure
            setTranslationHistory(prev => {
                if (prev.length > 0 && prev[prev.length - 1].isUser) {
                    return prev.slice(0, -1);
                }
                return prev;
            });
        }
    } finally {
      if (!translationRequestRef.current.isCancelled) {
        setIsLoading(false);
      }
      setEditingItemId(null);
      setEditedText("");
      setHistoryBeforeEdit(null);
    }
  }, [historyBeforeEdit]);


  const startEditing = (item: HistoryItem) => {
    setHistoryBeforeEdit(translationHistory);
    setEditingItemId(item.id);
    setEditedText(item.originalText);
  };

  const cancelEditing = () => {
    if (historyBeforeEdit) {
        setTranslationHistory(historyBeforeEdit);
    }
    setEditingItemId(null);
    setEditedText('');
    setHistoryBeforeEdit(null);
  };

  const submitEdit = () => {
    if (editingItemId === null) return;
  
    // Find the original user message to edit
    const messageIndex = translationHistory.findIndex(item => item.id === editingItemId);
    if (messageIndex === -1) {
      cancelEditing();
      return;
    }
  
    // Optimistically update the user's message text
    const newHistory = [...translationHistory];
    newHistory[messageIndex] = {
      ...newHistory[messageIndex],
      originalText: editedText,
    };
  
    // Find the corresponding AI message and mark it as loading
    // This assumes the AI message is always the next one.
    if (newHistory[messageIndex + 1] && !newHistory[messageIndex + 1].isUser) {
      newHistory[messageIndex + 1] = {
        ...newHistory[messageIndex + 1],
        translatedText: '...', // Loading indicator
      };
    }
    
    setTranslationHistory(newHistory);
    handleTranslate(editedText, true, editingItemId);
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard!');
    }, (err) => {
      console.error('Could not copy text: ', err);
      toast.error('Failed to copy');
    });
  };


  const renderHistoryItem = (item: HistoryItem, index: number) => {
    if (item.isUser) {
        const isEditing = editingItemId === item.id;
        const originalTextStatic = (
            <div
            className={cn(
              'transition-all duration-700 ease-in-out',
              isEditing ? 'w-0 opacity-0' : 'w-full opacity-100'
            )}
            style={{...(isEditing && { height: 0, overflow: 'hidden' })}}
          >
             <p className="text-lg">
                {item.originalText}
             </p>
           </div>
        );

        return (
          <div key={item.id} className="group flex justify-end items-center gap-2">
             <div className="relative h-8 w-8">
               <div className={cn(
                    "absolute inset-0 transition-all duration-300",
                    isEditing ? "opacity-0 -translate-x-4" : "opacity-100 translate-x-0"
                  )}
               >
                <Button variant="ghost" size="icon" className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => startEditing(item)}>
                     <Pencil size={14} />
                </Button>
               </div>
            </div>
            <div className={cn("bg-card rounded-t-2xl rounded-bl-2xl p-3 max-w-[80%]")}>
              {originalTextStatic}
              {isEditing && (
                 <div
                    className={cn(
                        "relative transition-all duration-700 ease-in-out overflow-hidden",
                        isEditing ? "w-full opacity-100" : "w-0 opacity-0"
                    )}
                    >
                    <div className="relative border border-blue-400 p-1.5 rounded-2xl">
                        <Textarea
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            className="bg-transparent border-transparent text-lg resize-none flex-1 focus-visible:ring-0 p-0 pr-16"
                            autoFocus
                            rows={1}
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
                        <div className="absolute top-0 right-0 flex items-center">
                            <Button variant="ghost" size="icon" onClick={cancelEditing} className="w-8 h-8 shrink-0">
                            <X size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={submitEdit} className="w-8 h-8 shrink-0">
                            <Check size={14} />
                            </Button>
                        </div>
                    </div>
                 </div>
              )}
            </div>
          </div>
        );
    } else {
      if (item.translatedText === '...') {
        return (
          <div key={item.id} className="flex justify-start items-start gap-3">
            <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1 animate-spin" />
          </div>
        );
      }
      
      return (
        <div key={item.id} className="group flex justify-start items-start gap-2 max-w-[80%]">
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center">
               <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0" />
               <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => handleCopyToClipboard(item.translatedText)}>
                    <Copy size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="w-8 h-8" disabled={true}>
                    <Volume2 size={14} />
                </Button>
                {item.fromCache && (
                  <Button variant="ghost" size="icon" className="w-8 h-8" disabled={true}>
                    <Database size={14} />
                  </Button>
                )}
               </div>
               
            </div>
             <div className="bg-card rounded-tr-2xl rounded-b-2xl p-3">
                <p className="text-lg">{item.translatedText}</p>
            </div>
          </div>
        </div>
      );
    }
  };


  return (
    <SidebarProvider defaultOpen={false}>
    <TooltipProvider>
      <div className="min-h-screen w-full bg-background text-foreground flex font-body antialiased">
        {/* <WelcomeToast historyLength={translationHistory.length} /> */}
        <CacheWarmer />
        {!videoFinished && (
          <video
            className="background-video"
            autoPlay
            muted
            playsInline
            onEnded={() => setVideoFinished(true)}
            src="/background.mp4"
          />
        )}
        <Sidebar>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                 <ThemeToggle />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {feedbackCount > 0 && (
                <SidebarMenuItem>
                  <Button variant="ghost" size="icon" className="text-blue-400" onClick={() => setIsFeedbackListOpen(true)}>
                    <List />
                  </Button>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="justify-center items-center">
            <SidebarMenu>
              <SidebarMenuItem>
                <Button variant="ghost" size="icon" className="text-blue-400" onClick={() => setIsFeedbackOpen(true)}>
                  <MessageSquare />
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
        <div className='relative flex flex-col flex-1'>          
          
        <ScrollArea className="w-full max-w-2xl mx-auto flex-1 px-4 no-scrollbar" viewportRef={scrollAreaViewportRef}>
          <div className="flex flex-col gap-6 pb-48 pt-16">
            {/* History */}
            {translationHistory.map(renderHistoryItem)}

            {/* Loading Indicator for new messages */}
            {isLoading && !editingItemId && (translationHistory.length === 0 || translationHistory[translationHistory.length-1]?.isUser) && (
                <div className="flex justify-start items-start gap-3">
                <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1 animate-spin" />
                </div>
            )}
          </div>
        </ScrollArea>
        {/* Input Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-10 bg-transparent pointer-events-none">
          <div className="w-full max-w-2xl mx-auto px-4 py-4 flex flex-col gap-3 pointer-events-auto">
            <div className={cn(
                "border-2 border-blue-400 rounded-full p-2 flex items-center gap-2 bg-background/50 backdrop-blur-sm",
                isShaking ? 'animate-shake' : ''
              )}>
              <Textarea
                placeholder="បញ្ចូលអត្ថបទដើម្បីបកប្រែ (en-kh-en)"
                className="bg-transparent border-none text-lg resize-none flex-1 focus-visible:ring-0 placeholder:text-[15px]"
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
              {!isLoading && (
                    <Button
                      size="icon"
                      className="bg-primary/10 text-blue-400 rounded-full w-12 h-12 hover:bg-transparent"
                      onClick={() => handleTranslate(inputText)}
                      disabled={isLoading || editingItemId !== null}
                    >
                      <Send size={24} />
                    </Button>
              )}
              {isLoading && (
                <Button
                      size="icon"
                      className="bg-destructive/10 text-red-400 rounded-full w-12 h-12 hover:bg-transparent animate-pulse-bg"
                      onClick={handleCancel}
                    >
                      <StopCircle size={24} />
                    </Button>
                )}
              </div>
          </div>
           <div className="fixed bottom-4 left-4 z-20 pointer-events-auto">
              <SidebarTrigger variant="ghost" size="icon" className="text-blue-400">
                  <Menu />
              </SidebarTrigger>
            </div>
        </div>
        </div>
        </SidebarInset>
        <FeedbackForm isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
        <Sheet open={isFeedbackListOpen} onOpenChange={setIsFeedbackListOpen}>
          <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl overflow-y-auto">
            <SheetHeader>
                <SheetTitle className="sr-only">Feedback Submissions</SheetTitle>
                <SheetDescription className="sr-only">
                    A list of all feedback submitted by users.
                </SheetDescription>
            </SheetHeader>
            <div className="py-4">
              <FeedbackTable />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
    </SidebarProvider>
  );
}
