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
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect, // <-- Import signInWithRedirect
  getRedirectResult, // <-- Import getRedirectResult
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { getHistory } from '@/ai/flows/get-history';
import { mergeFirestoreHistory } from '@/lib/db';
import { useIsMobile } from './use-mobile';


export type AuthState =
  | { state: 'loading' }
  | { state: 'authenticated'; user: User | null };

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  authState: AuthState;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>({ state: 'loading' });
  const isMobile = useIsMobile(); // Your custom hook to detect mobile

  const syncHistory = useCallback(async (uid: string) => {
    // Only attempt to sync history if the user is online.
    if (!navigator.onLine) {
      console.log("Offline: Skipping history sync.");
      return;
    }
    try {
      console.log('Starting history sync...');
      const firestoreHistory = await getHistory({ userId: uid });
      if (firestoreHistory) {
        await mergeFirestoreHistory(uid, firestoreHistory);
        console.log('History sync completed successfully.');
      }
    } catch (error) {
      console.error("History sync failed:", error);
    }
  }, []);


  // --- NEW useEffect for handling redirect results ---
  useEffect(() => {
    // This effect runs only once on component mount to check for redirect results
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          // User was successfully signed in via redirect
          toast.success(`Welcome back, ${result.user.displayName}!`);
          await syncHistory(result.user.uid);
          // onAuthStateChanged listener will pick this up
        }
      } catch (error: any) {
        console.error("Google sign-in redirect error:", error);
        // Handle the 'auth/popup-closed-by-user' for redirects too if needed,
        // though it's less common to explicitly get that on redirect completion.
        // It's more likely for other network or auth errors.
        toast.error("Google Sign-In Failed (Redirect)", {
          description: error.message || "An unexpected error occurred during redirect."
        });
      } finally {
        // Ensure state is updated after trying to handle redirect
        // The onAuthStateChanged listener will ultimately set the user/authState
      }
    };

    handleRedirect();
  }, [syncHistory]); // Dependency array includes syncHistory


  useEffect(() => {
    // This listener handles all auth state changes.
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Case 1: A user is signed in (either anonymous or Google).
        setUser(currentUser);
        setAuthState({ state: 'authenticated', user: currentUser });
      } else {
        // Case 2: No user is signed in. This happens on first load or after sign-out.
        if (navigator.onLine) {
          try {
            // Attempt to create a new anonymous session. This will cause this listener to run again.
            await signInAnonymously(auth);
          } catch (error) {
            console.error("Anonymous sign-in failed:", error);
            // If even anonymous sign-in fails, we are unauthenticated.
            setAuthState({ state: 'authenticated', user: null });
          }
        } else {
          // If offline and no user is cached, we cannot sign in.
          console.warn("Offline: Cannot create anonymous session. App will be in a limited state.");
          setUser(null);
          setAuthState({ state: 'authenticated', user: null });
        }
      }
    });

    return () => unsubscribe(); // Cleanup the listener on unmount.
  }, []); // Empty dependency array, runs once on mount


  const signOut = async () => {
    try {
      const user = auth.currentUser;
      const wasAnonymous = user?.isAnonymous;

      await firebaseSignOut(auth);
      // onAuthStateChanged will handle creating a new anonymous user automatically.

      if (!wasAnonymous) {
        toast.success('You have been signed out.');
      }

    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      if (isMobile) {
        // For mobile, use redirect
        await signInWithRedirect(auth, provider);
        // signInWithRedirect does NOT return a result here. The page will redirect.
        // The result will be handled by the getRedirectResult in the useEffect on page reload.
      } else {
        // For desktop, use popup
        const result = await signInWithPopup(auth, provider);
        if (result && result.user) {
          toast.success(`Welcome, ${result.user.displayName}!`);
          await syncHistory(result.user.uid);
        }
      }
    } catch (error: any) {
      console.error("Google sign-in error:", error);

      // Handle specific pop-up closed error for desktop
      if (error.code === 'auth/popup-closed-by-user' && !isMobile) {
        toast.info("Google sign-in cancelled. You closed the pop-up.", {
          description: "Please try again if you wish to sign in with Google."
        });
      } else {
        // Generic error for others, or redirect-specific errors if caught here
        toast.error("Google Sign-In Failed", {
          description: error.message || "An unexpected error occurred."
        });
      }
    }
  };

  const value = {
    user,
    authState,
    signOut,
    signInWithGoogle,
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
