
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
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithRedirect,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
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

  // Sign in anonymously on initial load
  const signInAnonymouslyOnce = useCallback(async () => {
    try {
      await signInAnonymously(auth);
      console.log('Signed in anonymously');
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      toast.error('Could not start a session. Some features might be unavailable.');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        // If no user, sign in anonymously
        await signInAnonymouslyOnce();
      }
      setAuthLoading(false);
    });
    
    // Handle the redirect result from Google Sign-In
    getRedirectResult(auth).catch(error => {
        console.error("Error getting redirect result:", error);
        toast.error("Failed to sign in with Google. Please try again.");
        setAuthLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [signInAnonymouslyOnce]);

  // Function to sign in with Google using redirect
  const signInWithGoogle = async () => {
    setAuthLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      toast.error('Could not sign in with Google. Please try again.');
      setAuthLoading(false);
    }
  };

  // Function to sign out
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // The onAuthStateChanged listener will handle setting user to null
      // and then trigger anonymous sign-in
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
