
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

export type AuthState =
  | { state: 'loading' }
  | { state: 'anonymous' }
  | { state: 'authenticated'; user: User }
  | { state: 'otp_sent' }
  | { state: 'verifying_otp' }
  | { state: 'error'; error: Error };

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  authState: AuthState;
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
  const [authState, setAuthState] = useState<AuthState>({ state: 'loading' });

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
      if (currentUser) {
        setUser(currentUser);
        if (currentUser.isAnonymous) {
          setAuthState({ state: 'anonymous' });
        } else {
          setAuthState({ state: 'authenticated', user: currentUser });
          await syncHistory(currentUser.uid);
        }
      } else {
        // This case should ideally not be hit if anonymous sign-in is robust
        setAuthState({ state: 'loading'});
        await signInAnonymously(auth);
      }
    });
    return () => unsubscribe();
  }, [syncHistory]);

  const signInWithPhone = async (phoneNumber: string) => {
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
        setAuthState({ state: 'otp_sent' });
    } catch (error: any) {
      setAuthState({ state: 'error', error });
      // Reset the verifier if it fails.
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        recaptchaVerifier = null;
      }
      throw error;
    }
  };

  const verifyOtp = async (otp: string) => {
    if (!confirmationResult) {
      const error = new Error("No confirmation result available. Please send the code first.");
      setAuthState({ state: 'error', error });
      throw error;
    }
    setAuthState({ state: 'verifying_otp' });
    try {
      await confirmationResult.confirm(otp);
      // onAuthStateChanged will handle setting the 'authenticated' state.
    } catch (error: any) {
       setAuthState({ state: 'error', error });
       throw error;
    }
  };


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setAuthState({ state: 'loading' });
      toast.success('You have been signed out.');
      // onAuthStateChanged will trigger anonymous sign-in, which sets state to 'anonymous'
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
       setAuthState({ state: 'error', error });
    }
  };
  
  const value = {
    user,
    authState,
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
