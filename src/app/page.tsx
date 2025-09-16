
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, Send, Pencil, Check, X, Volume2, Copy, Database, Menu, StopCircle, MessageSquare, List, History, LoaderCircle, Trash2, Phone, Save } from 'lucide-react';
import { translateText } from '@/ai/flows/translate-text';
import { detectLanguage } from '@/ai/flows/detect-language';
import { saveHistory } from '@/ai/flows/save-history';
import { getTranslationFromDb, saveTranslationToDb, getHistoryForUser, HistoryEntry, mergeFirestoreHistory, clearHistoryForUser } from '@/lib/db';
import { getTranslationFromFirestoreCache } from '@/lib/translation-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { seedDatabaseIfNeeded } from '@/lib/seeder';
import {
  TooltipProvider,
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
  useSidebar,
} from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { FeedbackForm } from '@/components/feedback-form';
import { CacheWarmer } from '@/components/cache-warmer';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFeedbackStore } from '@/lib/feedback-store';
import { FeedbackTable } from '@/components/feedback-table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { GoogleIcon } from '@/components/icons/google-icon';
import { FacebookIcon } from '@/components/icons/facebook-icon';
import { PhoneIcon } from '@/components/icons/phone-icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { getHistory } from '@/ai/flows/get-history';
import { TikTokIcon } from '@/components/icons/tiktok-icon';
import type { ConfirmationResult } from 'firebase/auth';


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
  parseInt(process.env.NEXT_PUBLIC_LOCAL_CACHE_STALE_MS || '', 10) || 86400000;

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

const WelcomeMessage = ({ user }: { user: any }) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }
  
  if (user) {
    const displayName = user.displayName;
    const firstName = displayName?.split(' ')[0] || '';
    if (firstName && firstName !== 'New') {
        return (
          <div className="text-center text-lg font-semibold p-2">
            Hello, {firstName}
          </div>
        );
    }
     return (
        <div className="text-center text-lg font-semibold p-2">
            Hello!
        </div>
    )
  }

  return (
      <div className="text-center text-lg font-semibold p-2">
        Sign in to save your history
      </div>
  );
};


type InputAreaProps = {
  inputText: string;
  setInputText: (text: string) => void;
  isLoading: boolean;
  isEditing: boolean;
  isShaking: boolean;
  onTranslate: () => void;
  onCancel: () => void;
  textareaRef: React.Ref<HTMLTextAreaElement>;
};

// Extracted InputArea component
const InputArea = ({
  inputText,
  setInputText,
  isLoading,
  isEditing,
  isShaking,
  onTranslate,
  onCancel,
  textareaRef,
}: InputAreaProps) => (
  <div
    className={cn(
      'relative w-full max-w-3xl mx-auto px-4 py-4 flex flex-col items-center gap-3 pointer-events-auto',
      isShaking ? 'animate-shake' : ''
    )}
  >
    <div className="relative w-full border-2 border-blue-400 rounded-full p-2 flex items-center gap-2 bg-background/80 backdrop-blur-sm overflow-hidden" id="enkhTextArea">
        <Textarea
          ref={textareaRef}
          placeholder="សរសេរ..."
          className="bg-transparent border-none text-lg resize-none flex-1 focus-visible:ring-0 placeholder:text-[15px] z-10"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onTranslate();
            }
          }}
          disabled={isEditing}
        />
    </div>
    <div className="flex justify-center items-center gap-4 mt-2">
      {!isLoading && (
        <Button
          size="icon"
          className="bg-primary/10 text-blue-400 rounded-full w-12 h-12 hover:bg-transparent"
          onClick={onTranslate}
          disabled={isLoading || isEditing}
        >
          <Send size={24} />
        </Button>
      )}
      {isLoading && (
        <Button
          size="icon"
          className="bg-destructive/10 text-red-400 rounded-full w-12 h-12 hover:bg-transparent animate-pulse-bg"
          onClick={onCancel}
        >
          <StopCircle size={24} />
        </Button>
      )}
    </div>
  </div>
);

function PhoneAuthForm({ onSignIn }: { onSignIn: () => void }) {
    const [phoneNumber, setPhoneNumber] = useState('+85512822499');
    const [code, setCode] = useState('');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);

    const { signInWithPhone } = useAuth();
    
    const handleSendCode = async () => {
        if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
            toast.error("Invalid Phone Number", { description: "Please enter in E.164 format (e.g., +85512345678)." });
            return;
        }
        setIsSendingCode(true);
        const result = await signInWithPhone(phoneNumber);
        if (result) {
            setConfirmationResult(result);
            toast.success("Verification code sent!");
        }
        setIsSendingCode(false);
    };

    const handleVerifyCode = async () => {
        if (!confirmationResult) return;
        setIsVerifyingCode(true);
        try {
            await confirmationResult.confirm(code);
            // The onAuthStateChanged listener will handle the successful sign-in.
            toast.success("Signed in successfully!");
            onSignIn(); // Close the sheet on successful sign-in
        } catch (error: any) {
            toast.error("Verification Failed", { description: error.message || "Invalid code. Please try again." });
        }
        setIsVerifyingCode(false);
    };

    if (confirmationResult) {
        return (
            <div className="flex flex-col gap-2">
                <Input 
                    type="text" 
                    placeholder="Verification Code" 
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={isVerifyingCode}
                />
                <Button onClick={handleVerifyCode} disabled={isVerifyingCode}>
                    {isVerifyingCode ? <LoaderCircle className="animate-spin" /> : "Verify & Sign In"}
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2">
            <Input 
                type="tel" 
                placeholder="+85512345678" 
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isSendingCode}
            />
            <Button onClick={handleSendCode} disabled={isSendingCode}>
                {isSendingCode ? <LoaderCircle className="animate-spin" /> : "Send Code"}
            </Button>
        </div>
    )
}

function ProfileEnhancementForm() {
    const { linkWithGoogle, linkWithFacebook } = useAuth();
    const [isLinking, setIsLinking] = useState(false);

    const handleLink = async (provider: 'google' | 'facebook') => {
        setIsLinking(true);
        try {
            if (provider === 'google') {
                await linkWithGoogle();
            } else {
                await linkWithFacebook();
            }
            toast.success("Profile updated!");
            // The auth listener will update the user state, causing this component to unmount.
        } catch (error: any) {
            console.error(`Failed to link with ${provider}:`, error);
            if (error.code === 'auth/credential-already-in-use') {
                 toast.error("Account Already Exists", { description: "This social account is already linked to another user."});
            } else {
                toast.error("Failed to link account", { description: error.message });
            }
        } finally {
            setIsLinking(false);
        }
    };

    return (
        <div className="p-4 bg-card rounded-2xl shadow-md space-y-3 text-center">
            <p className="text-sm font-medium">Welcome! Complete your profile in one click.</p>
            <div className="flex justify-center items-center gap-4">
                <Button 
                    onClick={() => handleLink('google')} 
                    disabled={isLinking}
                    variant="outline"
                    className="flex-1"
                >
                    {isLinking ? <LoaderCircle className="animate-spin mr-2" /> : <GoogleIcon className="h-5 w-5 mr-2" />}
                    Connect Google
                </Button>
                <Button 
                    onClick={() => handleLink('facebook')} 
                    disabled={isLinking}
                    variant="outline"
                    className="flex-1"
                >
                    {isLinking ? <LoaderCircle className="animate-spin mr-2" /> : <FacebookIcon className="h-5 w-5 mr-2" />}
                    Connect Facebook
                </Button>
            </div>
             <p className="text-xs text-muted-foreground pt-2">Connect a social account to automatically add your name and photo.</p>
        </div>
    );
}

function PageContent() {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [translationHistory, setTranslationHistory] = useState<HistoryItem[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editedText, setEditedText] = useState('');
  const [historyBeforeEdit, setHistoryBeforeEdit] = useState<HistoryItem[] | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackListOpen, setIsFeedbackListOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [debugRedirectUri, setDebugRedirectUri] = useState<string | null>(null);
  const [isPhoneAuthOpen, setIsPhoneAuthOpen] = useState(false);
  
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);
  const translationRequestRef = useRef<{ isCancelled: boolean }>({ isCancelled: false });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { setServerFeedback } = useFeedbackStore();
  const { setOpenMobile } = useSidebar();
  const { user, signOut, authState, signInWithGoogle, signInWithFacebook, signInWithTikTok, signInWithCustomToken } = useAuth();
  const [localHistory, setLocalHistory] = useState<HistoryEntry[]>([]);
  const prevUserRef = useRef(user);

  // Determine if the profile enhancement form should be shown.
  // It appears if a user is logged in but has no display name.
  const showProfileForm = user && !user.displayName;

  const scrollToBottom = () => {
    if (scrollAreaViewportRef.current) {
      scrollAreaViewportRef.current.scrollTop =
        scrollAreaViewportRef.current.scrollHeight;
    }
  };

  const fetchLocalHistory = useCallback(async () => {
    if (!user) {
        setLocalHistory([]);
        return;
    }
    try {
      const history = await getHistoryForUser(user.uid);
      setLocalHistory(history);
    } catch (error) {
      console.error("Failed to fetch local history:", error);
    }
  }, [user]);

  const handleTranslate = useCallback(async (textToTranslate: string, isEditing = false, editedMessageId: number | null = null) => {
    const trimmedInput = textToTranslate.trim();
    if (!trimmedInput) {
      if (!isEditing) {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 820);
      }
      return;
    }
  
    if (!hasStarted) {
        setHasStarted(true);
    }

    setIsLoading(true);
    translationRequestRef.current.isCancelled = false;
    if (!isEditing) {
        setInputText('');
    }
  
    if (!isEditing) {
        const userMessage: HistoryItem = {
          id: Date.now(),
          originalText: trimmedInput,
          translatedText: '',
          sourceLanguage: 'en',
          targetLanguage: 'km',
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
  
      const checkCaches = async (text: string, lang1: 'en' | 'km', lang2: 'en' | 'km') => {
        const iDbCache = await getTranslationFromDb(text, lang1, lang2);
        if (iDbCache && (Date.now() - iDbCache.createdAt.getTime() < LOCAL_CACHE_STALE_MS)) {
          return { translatedText: iDbCache.translatedText, source: lang1, target: lang2, fromCache: true };
        }
        const firestoreCache = await getTranslationFromFirestoreCache(text, lang1, lang2);
        if (firestoreCache) {
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
  
      if (!translatedText) {
        if (!navigator.onLine) {
            toast.error("You are offline", {
                description: "This translation is not in the offline dictionary. Please connect to the internet to translate new words.",
            });
            setTranslationHistory(prev => prev.slice(0, -1));
            setIsLoading(false);
            return;
        }

        console.log('2. SERVER CALL: Calling server-side flows...');
        try {
            console.log('   -> 2a. DETECT: Detecting input language...');
            const detectionResult = await detectLanguage({ text: trimmedInput });
            if (translationRequestRef.current.isCancelled) return;
            const detectedLang = detectionResult.language;
            
            if (detectedLang === 'unknown') {
                toast.error('Language Not Detected', { description: 'Could not determine the input language. Please use English or Khmer.' });
                throw new Error('Language detection failed');
            }
            console.log(`      ✅ DETECTED: Language is '${detectedLang}'.`);
            
            const detectedSourceLang = detectedLang;
            const detectedTargetLang = detectedLang === 'en' ? 'km' : 'en';

            console.log('   -> 2b. TRANSLATE: Calling server-side translation...');
            const result = await translateText({ text: trimmedInput, sourceLanguage: detectedSourceLang, targetLanguage: detectedTargetLang });
            if (translationRequestRef.current.isCancelled) return;
            
            translatedText = result.translatedText;
            fromCache = result.fromCache;
            sourceLang = detectedSourceLang;
            targetLang = detectedTargetLang;
            
            console.log('3. LOCAL WRITE: Saving/updating translation in IndexedDB symmetrically.');
            await saveTranslationToDb(normalizedInput, sourceLang, targetLang, translatedText);
            await saveTranslationToDb(normalizeText(translatedText), targetLang, sourceLang, trimmedInput);

        } catch (e) {
            throw e;
        }
      }
  
      if (translationRequestRef.current.isCancelled) return;
  
      if (!translatedText || !sourceLang || !targetLang) {
          throw new Error("Translation process failed to produce a result.");
      }
  
      if (user) {
        const historyData = {
            userId: user.uid,
            originalText: trimmedInput,
            translatedText: translatedText,
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
        };
        
        // This flow saves to Firestore and triggers the real-time listener,
        // which will then update the local DB and UI.
        saveHistory(historyData).catch(err => {
            console.error("Failed to sync history to cloud:", err);
            // Optionally, save to local DB directly as a fallback for offline.
        });
      }

      const aiMessage: HistoryItem = {
        id: isEditing && editedMessageId ? editedMessageId + 1 : Date.now() + 1,
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
  }, [hasStarted, historyBeforeEdit, user]);

  const handleClearHistory = async () => {
    if (!user) return;
    try {
      await clearHistoryForUser(user.uid);
      await fetchLocalHistory(); // Refresh the history list from the DB (it will be empty)
      toast.success("Local history has been cleared.");
    } catch (error) {
      console.error("Failed to clear history:", error);
      toast.error("Failed to clear history.");
    }
  };

  useEffect(() => {
    seedDatabaseIfNeeded();
    
    const feedbacksCollection = collection(db, 'feedbacks');
    const q = query(feedbacksCollection, orderBy('createdAt', 'desc'));
    const unsubscribeFeedback = onSnapshot(q, (querySnapshot) => {
        const feedbacks = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        setServerFeedback(feedbacks as any);
    });

    // For debugging: check for the redirect URI in sessionStorage
    const debugUri = sessionStorage.getItem('debug_tiktok_redirect_uri');
    if (debugUri) {
        setDebugRedirectUri(debugUri);
        // Optional: clear it after reading so it doesn't persist
        // sessionStorage.removeItem('debug_tiktok_redirect_uri');
    }

    return () => unsubscribeFeedback();
  }, [setServerFeedback]);

  const syncAndFetchHistory = useCallback(async () => {
    if (!user || !navigator.onLine) {
        console.log("SYNC: Offline or no user, loading local history.");
        await fetchLocalHistory();
        return;
    }
    try {
        console.log('SYNC: Online user detected. Starting cloud sync process...');
        
        // 1. Clear local history to ensure a clean slate before syncing
        await clearHistoryForUser(user.uid);
        console.log('   -> Cleared local history for a clean sync.');

        // 2. Fetch the latest history from the cloud.
        const firestoreHistory = await getHistory({ userId: user.uid });
        console.log(`   -> Fetched ${firestoreHistory.length} items from Firestore.`);
        
        // 3. Merge cloud history into the (now empty) local database.
        await mergeFirestoreHistory(user.uid, firestoreHistory);
        console.log('   -> Merged Firestore history into local DB.');

        // 4. Refresh the UI by fetching the complete, merged history from the local DB.
        await fetchLocalHistory();
        console.log('   -> UI updated with synchronized history.');

    } catch (error) {
        console.error("SYNC: Full sync process failed:", error);
        // Fallback to local history if cloud sync fails.
        await fetchLocalHistory();
    }
}, [user, fetchLocalHistory]);

// This effect runs when the user's authentication state changes.
useEffect(() => {
    // Only run sync when auth state is confirmed to be authenticated
    if (authState.state === 'authenticated') {
        syncAndFetchHistory();
    } else if (authState.state === 'unauthenticated') {
        setLocalHistory([]); // Clear history on logout
    }
}, [authState.state, user, syncAndFetchHistory]);


// This effect sets up the real-time listener for subsequent updates.
useEffect(() => {
    if (!user) {
        return () => {}; // No user, no listener.
    }

    console.log(`SYNC: Setting up real-time history listener for user ${user.uid}...`);
    const historyCollection = collection(db, 'users', user.uid, 'history');
    const q = query(historyCollection, orderBy('createdAt', 'desc'));

    const unsubscribeHistory = onSnapshot(q, async (snapshot) => {
        // hasPendingWrites is true if the snapshot includes local-only changes.
        // We only want to sync when the change comes from the server.
        if (snapshot.metadata.hasPendingWrites) {
            console.log("SYNC: Ignoring local write event.");
            // We should still refresh local history to show the user's own new translation
            await fetchLocalHistory();
            return;
        }

        console.log('SYNC: Received real-time update from another device. Re-syncing...');
        // A change occurred on another device, so we re-run the full sync logic.
        await syncAndFetchHistory();
    }, (error) => {
        console.error("SYNC: Real-time history listener error:", error);
    });

    return () => {
        console.log('SYNC: Tearing down real-time history listener.');
        unsubscribeHistory();
    };
}, [user, syncAndFetchHistory]);


  useEffect(() => {
    // The timeout ensures that the DOM has updated before we try to scroll
    setTimeout(() => {
      scrollToBottom();
    }, 0);
  }, [translationHistory, isLoading]);

  useEffect(() => {
    // When the user logs in, close the sidebar.
    if (!prevUserRef.current && user) {
      setOpenMobile(false);
      setIsPhoneAuthOpen(false);
      // After a short delay to allow the sidebar to close, focus the textarea.
      if (!showProfileForm) {
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 300); // 300ms matches the default sheet animation duration
      }
    }
    // Update the ref to the current user for the next render.
    prevUserRef.current = user;
  }, [user, setOpenMobile, showProfileForm]);

  // Handle TikTok custom token sign-in
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    if (error) {
      toast.error("TikTok Sign-In Failed", { description: error });
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (token) {
      signInWithCustomToken(token);
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [signInWithCustomToken]);


  if (authState.state === 'loading') {
    return (
      <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))'
      }}>
          <LoaderCircle className="h-12 w-12 animate-spin text-blue-400" />
      </div>
    );
  }

  const handleCancel = () => {
    console.log('User cancelled translation.');
    translationRequestRef.current.isCancelled = true;
    setIsLoading(false);

    if (editingItemId && historyBeforeEdit) {
        setTranslationHistory(historyBeforeEdit);
        setHistoryBeforeEdit(null);
    } else {
        setTranslationHistory(prev => {
            if (prev.length > 0 && prev[prev.length - 1].isUser) {
                return prev.slice(0, -1);
            }
            return prev;
        });
    }
    setEditingItemId(null);
    setEditedText('');
    setHistoryBeforeEdit(null);
  };

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
  
    const messageIndex = translationHistory.findIndex(item => item.id === editingItemId);
    if (messageIndex === -1) {
      cancelEditing();
      return;
    }
  
    const newHistory = [...translationHistory];
    newHistory[messageIndex] = {
      ...newHistory[messageIndex],
      originalText: editedText,
    };
  
    if (newHistory[messageIndex + 1] && !newHistory[messageIndex + 1].isUser) {
      newHistory[messageIndex + 1] = {
        ...newHistory[messageIndex + 1],
        translatedText: '...',
      };
    }
    
    setTranslationHistory(newHistory);
    handleTranslate(editedText, true, editingItemId);
  };

  const handleCopyToClipboard = (text: string, entity: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${entity} copied to clipboard!`);
    }, (err) => {
      console.error(`Could not copy ${entity}: `, err);
      toast.error(`Failed to copy ${entity}`);
    });
  };

  const handleHistoryItemClick = (item: HistoryEntry) => {
    const userMessage: HistoryItem = {
      id: Date.now(),
      originalText: item.originalText,
      translatedText: '',
      sourceLanguage: item.sourceLanguage,
      targetLanguage: item.targetLanguage,
      isUser: true,
    };
    const aiMessage: HistoryItem = {
      id: Date.now() + 1,
      originalText: item.originalText,
      translatedText: item.translatedText,
      sourceLanguage: item.sourceLanguage,
      targetLanguage: item.targetLanguage,
      isUser: false,
      fromCache: true,
    };
    setTranslationHistory(prev => [...prev, userMessage, aiMessage]);
    setOpenMobile(false);
    setIsHistoryOpen(false);
  };

  const renderHistoryItem = (item: HistoryItem) => {
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
            <div className={cn("bg-blue-100 dark:bg-zinc-700 rounded-t-2xl rounded-bl-2xl p-3 max-w-[80%]")}>
              {originalTextStatic}
              {isEditing && (
                 <div
                    className={cn(
                        "relative transition-all duration-700 ease-in-out overflow-hidden",
                        isEditing ? "w-full opacity-100" : "w-0 opacity-0"
                    )}
                    >
                    <div className="relative border-b-0 border-r-0 border border-blue-400 p-1.5 rounded-2xl">
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
                <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => handleCopyToClipboard(item.translatedText, 'Translation')}>
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
             <div className="p-3 bg-transparent">
                <p className="text-lg">{item.translatedText}</p>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
      <div className="min-h-screen w-full bg-background text-foreground flex font-body antialiased">
        <div id="recaptcha-container" />
        <CacheWarmer />
        <Sidebar>
          <div className="flex h-full w-full flex-col border-r-2 border-blue-400">
            <SidebarHeader>
              <div className="flex flex-col items-center justify-center p-2 gap-2">
                {authState.state === 'authenticated' && user ? (
                  <button className="flex items-center justify-center gap-2 focus:outline-none rounded-full" onClick={signOut}>
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={user.photoURL || ''}
                        alt={user.displayName || 'User'}
                      />
                      <AvatarFallback>
                        {user.displayName?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-12">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-blue-400"
                          onClick={signInWithGoogle}
                        >
                          <GoogleIcon className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-blue-400"
                          onClick={signInWithFacebook}
                        >
                          <FacebookIcon className="h-5 w-5" />
                        </Button>
                        <a href="/auth/tiktok/redirect" className="hidden">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-blue-400"
                          >
                            <TikTokIcon className="h-5 w-5" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-blue-400"
                          onClick={() => setIsPhoneAuthOpen(true)}
                        >
                          <PhoneIcon className="h-5 w-5" />
                        </Button>
                    </div>
                  </>
                )}
              </div>
              <SidebarMenu className="gap-3 justify-center items-center">
                <SidebarMenuItem>
                  <Button variant="ghost" size="icon" className="text-blue-400" onClick={() => setIsFeedbackListOpen(true)}>
                    <List />
                  </Button>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Button variant="ghost" size="icon" className="text-blue-400" onClick={() => setIsFeedbackOpen(true)}>
                    <MessageSquare />
                  </Button>
                </SidebarMenuItem>
                 {localHistory.length > 0 && (
                  <SidebarMenuItem>
                    <Button variant="ghost" size="icon" className="text-blue-400" onClick={() => setIsHistoryOpen(true)}>
                      <History />
                    </Button>
                  </SidebarMenuItem>
                 )}
              </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
            </SidebarContent>
             <SidebarFooter>
                <SidebarMenu className="gap-3 justify-center items-center">
                    <SidebarMenuItem>
                        <ThemeToggle />
                    </SidebarMenuItem>
                </SidebarMenu>
             </SidebarFooter>
          </div>
        </Sidebar>
        <SidebarInset>
        <div className='relative flex flex-col flex-1 h-screen'>          
          
        <ScrollArea 
            className={cn(
                "w-full max-w-2xl mx-auto flex-1 px-4 no-scrollbar transition-all duration-500 ease-in-out",
                hasStarted || showProfileForm ? "opacity-100" : "opacity-0"
            )} 
            viewportRef={scrollAreaViewportRef}
        >
          <div className="flex flex-col gap-6 pb-48 pt-16">
            {showProfileForm && (
              <div className="flex justify-center">
                  <ProfileEnhancementForm />
              </div>
            )}
            {translationHistory.map(renderHistoryItem)}

            {isLoading && !editingItemId && (translationHistory.length === 0 || translationHistory[translationHistory.length-1]?.isUser) && (
                <div className="flex justify-start items-start gap-3">
                <Sparkles className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1 animate-spin" />
                </div>
            )}
          </div>
        </ScrollArea>

        <div className={cn(
            "fixed left-0 right-0 z-10 transition-all duration-500 ease-in-out",
            (hasStarted || showProfileForm) ? "bottom-0" : "top-1/2 -translate-y-1/2",
            !(hasStarted || showProfileForm) && "flex items-center justify-center"
        )}>
             <div className="w-full pointer-events-auto">
                {!showProfileForm && <WelcomeMessage user={user} />}
                {debugRedirectUri && (
                    <div className="w-full max-w-3xl mx-auto px-4 py-2 text-xs text-center text-muted-foreground bg-muted rounded-md mb-2 break-all">
                        <p className="font-bold">Debug Redirect URI:</p>
                        <p>{debugRedirectUri}</p>
                    </div>
                )}
                {!showProfileForm && (
                  <InputArea
                      textareaRef={textareaRef}
                      inputText={inputText}
                      setInputText={setInputText}
                      isLoading={isLoading}
                      isEditing={editingItemId !== null}
                      isShaking={isShaking}
                      onTranslate={() => handleTranslate(inputText)}
                      onCancel={handleCancel}
                  />
                )}
            </div>
        </div>
        
           <div className="fixed top-4 left-4 z-20 pointer-events-auto">
              <SidebarTrigger variant="ghost" size="icon" className="text-blue-400">
                  <Menu />
              </SidebarTrigger>
            </div>
        </div>
        </SidebarInset>
        <FeedbackForm
          isOpen={isFeedbackOpen}
          onClose={() => setIsFeedbackOpen(false)}
          onFeedbackSubmitted={() => {
            setOpenMobile(false);
setIsFeedbackOpen(false);
            setIsFeedbackListOpen(true);
          }}
        />
        <Sheet open={isFeedbackListOpen} onOpenChange={setIsFeedbackListOpen}>
          <SheetContent side="right" className="w-[80%] sm:max-w-xl md:max-w-2xl lg:max-w-3xl overflow-y-auto flex flex-col items-center justify-center" hideCloseButton={true}>
            <SheetHeader className="sr-only">
                <SheetTitle>Feedback Submissions</SheetTitle>
                <SheetDescription>
                    A list of all feedback submitted by users.
                </SheetDescription>
            </SheetHeader>
            <div className="py-4 w-full">
              <FeedbackTable />
            </div>
          </SheetContent>
        </Sheet>
         <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <SheetContent side="left" className="w-[80%] sm:max-w-xs overflow-y-auto flex flex-col p-0" hideCloseButton={true}>
            <SheetHeader className="sr-only">
              <SheetTitle>Recent History</SheetTitle>
            </SheetHeader>
            <div className="relative p-2 border-b border-border h-14 flex items-center justify-start">
              {localHistory.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-blue-400">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete your translation history from this device. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleClearHistory}>
                          Continue
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
              )}
            </div>
            <ScrollArea className="h-full w-full">
                <div className="flex flex-col gap-1 p-2">
                {localHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2 text-center">No history yet.</p>
                ) : (
                    localHistory.map((item) => (
                        <button 
                            key={item.id}
                            className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors"
                            onClick={() => handleHistoryItemClick(item)}
                        >
                            <p className="font-semibold truncate">{item.originalText}</p>
                            <p className="text-sm text-muted-foreground truncate">{item.translatedText}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </p>
                        </button>
                    ))
                )}
                </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
        <Sheet open={isPhoneAuthOpen} onOpenChange={setIsPhoneAuthOpen}>
            <SheetContent
                side="bottom"
                className="bg-muted text-card-foreground h-auto w-full rounded-t-2xl border-t p-4 shadow-lg sm:max-w-lg sm:mx-auto"
                onInteractOutside={() => setIsPhoneAuthOpen(false)}
            >
                <SheetHeader>
                    <SheetTitle>Sign In with Phone</SheetTitle>
                    <SheetDescription>
                        Enter your phone number to receive a verification code.
                    </SheetDescription>
                </SheetHeader>
                <div className="py-4">
                    <PhoneAuthForm onSignIn={() => setIsPhoneAuthOpen(false)} />
                </div>
            </SheetContent>
        </Sheet>
      </div>
  );
}

export default function Home() {
  return (
    <SidebarProvider defaultOpen={false}>
      <TooltipProvider>
        <PageContent />
      </TooltipProvider>
    </SidebarProvider>
  );
}

    

    