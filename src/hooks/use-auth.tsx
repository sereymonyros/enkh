
'use client';

import {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
  useCallback,
} from 'react';
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut as firebaseSignOut,
  User,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { getHistory } from '@/ai/flows/get-history';
import { mergeFirestoreHistory } from '@/lib/db';

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  authLoading: boolean;
  signInWithPhone: (phoneNumber: string) => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncHistory: () => Promise<void>;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

// Store recaptcha and confirmationResult outside the component state
let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const syncHistory = useCallback(async (uid: string) => {
    try {
      console.log('Starting history sync...');
      const firestoreHistory = await getHistory({ userId: uid });
      await mergeFirestoreHistory(uid, firestoreHistory);
      console.log('History sync completed successfully.');
    } catch (error) {
      console.error("History sync failed:", error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthLoading(true);
      if (currentUser) {
        setUser(currentUser);
        if (!currentUser.isAnonymous) {
          await syncHistory(currentUser.uid);
        }
      } else {
        await signInAnonymously(auth);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [syncHistory]);

  const signInWithPhone = async (phoneNumber: string) => {
    setAuthLoading(true);
    try {
        if (!recaptchaVerifier) {
            recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible',
                'callback': (response: any) => {
                    // reCAPTCHA solved, allow signInWithPhoneNumber.
                }
            });
        }
        
        confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);

    } catch (error) {
      setAuthLoading(false);
      // Reset the verifier if it fails.
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        recaptchaVerifier = null;
      }
      // Re-throw to be caught by the UI component
      throw error;
    } finally {
      // Don't set authLoading to false here, wait for OTP verification
    }
  };

  const verifyOtp = async (otp: string) => {
    if (!confirmationResult) {
      throw new Error("No confirmation result available. Please send the code first.");
    }
    setAuthLoading(true);
    try {
      await confirmationResult.confirm(otp);
      // onAuthStateChanged will handle the rest.
    } catch (error) {
       setAuthLoading(false);
       throw error;
    }
    // `authLoading` will be set to false by onAuthStateChanged
  };


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      toast.success('You have been signed out.');
      // onAuthStateChanged will trigger anonymous sign-in
    } catch (error) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };
  
  const value = {
    user,
    authLoading,
    signInWithPhone,
    verifyOtp,
    signOut,
    syncHistory: async () => {
      if (auth.currentUser) await syncHistory(auth.currentUser.uid);
    }
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

    