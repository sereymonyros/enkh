
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
  GoogleAuthProvider,
  User,
  linkWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { getHistory } from '@/ai/flows/get-history';
import { mergeFirestoreHistory } from '@/lib/db';

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  syncHistory: () => Promise<void>;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

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
      setUser(currentUser); // Immediately set user state
      if (currentUser) {
        // If there's a user, sync their history.
        if (!currentUser.isAnonymous) {
          await syncHistory(currentUser.uid);
        }
      } else {
        // If there's no user, sign in anonymously.
        // This will trigger another onAuthStateChanged event.
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error('Anonymous sign-in failed:', error);
        }
      }
      // Regardless of outcome, stop loading after the initial check is done.
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [syncHistory]);

  const signInWithGoogle = async () => {
    setAuthLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      let result;
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        // If the user is anonymous, link their account instead of signing in.
        // This preserves their UID and any data associated with it.
        result = await linkWithPopup(auth.currentUser, provider);
      } else {
        // If there's no user or they are already a permanent user, do a normal sign-in.
        result = await signInWithPopup(auth, provider);
      }
      // The onAuthStateChanged listener will handle setting the user and syncing history.
      toast.success(`Welcome, ${result.user.displayName}!`);
    } catch (error: any) {
      console.error('Google sign-in failed:', error);
      toast.error('Could not sign in with Google.', {
        description: error.message || 'Please try again later.',
      });
    } finally {
      // Always set loading to false after the process is complete.
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // The onAuthStateChanged listener will handle setting user to null
      // and then automatically trigger anonymous sign-in again.
      toast.success('You have been signed out.');
    } catch (error) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };
  
  const value = {
    user,
    authLoading,
    signInWithGoogle,
    signOut,
    // syncHistory is now internal to the provider, but we could expose it if needed
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
