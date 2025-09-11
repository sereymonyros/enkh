
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
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { getHistory } from '@/ai/flows/get-history';
import { mergeFirestoreHistory } from '@/lib/db';

export type AuthState =
  | { state: 'loading' }
  | { state: 'authenticated'; user: User };

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
    // This effect handles the entire auth lifecycle, including redirect results.
    // It's structured to prevent race conditions on mobile.

    const processAuth = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // If there's a result, the user has just signed in via redirect.
          // `onAuthStateChanged` will soon fire with this new user.
          toast.success(`Welcome, ${result.user.displayName}!`);
          // We can set the user state here to be more immediate, though onAuthStateChanged will confirm it.
          setUser(result.user);
          setAuthState({ state: 'authenticated', user: result.user });
          await syncHistory(result.user.uid);
          return; // Early return to avoid conflicts with the listener below
        }
      } catch (error) {
        console.error("Google redirect sign-in error:", error);
        toast.error("Sign-in failed", { description: "Could not complete sign-in with Google." });
      }

      // If there was no redirect result, we check the current auth state.
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          // If a user (Google or anonymous) is found, set the state.
          setUser(currentUser);
          setAuthState({ state: 'authenticated', user: currentUser });
          if (!currentUser.isAnonymous) {
            await syncHistory(currentUser.uid);
          }
        } else {
          // If there is NO user at all, it's a fresh session.
          // We create a new anonymous user. `onAuthStateChanged` will run again.
          try {
            await signInAnonymously(auth);
          } catch (error) {
            console.error("Anonymous sign-in failed:", error);
            toast.error("Could not start a session. Please refresh the page.");
          }
        }
      });

      return unsubscribe;
    };

    const unsubscribePromise = processAuth();

    return () => {
        unsubscribePromise.then(unsubscribe => {
            if (unsubscribe) {
                unsubscribe();
            }
        });
    };
}, [syncHistory]);


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged will handle creating a new anonymous user automatically.
      toast.success('You have been signed out.');
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    setAuthState({ state: 'loading' }); 
    try {
        await signInWithRedirect(auth, provider);
    } catch (error: any) {
        console.error("Google sign-in error:", error);
        toast.error("Google Sign-In Failed", {
            description: error.message || "An unexpected error occurred."
        });
        if (user) {
            setAuthState({ state: 'authenticated', user });
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
