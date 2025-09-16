
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
  signOut as firebaseSignOut,
  User,
  GoogleAuthProvider,
  FacebookAuthProvider,
  getRedirectResult,
  signInWithRedirect,
  signInWithCustomToken as firebaseSignInWithCustomToken,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  updateProfile,
  linkWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';

export type AuthState =
  | { state: 'loading' }
  | { state: 'unauthenticated' }
  | { state: 'authenticated'; user: User };

type UpdateData = {
    displayName?: string;
    photoURL?: string;
}

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  authState: AuthState;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signInWithTikTok: () => Promise<void>;
  signInWithCustomToken: (token: string) => Promise<void>;
  signInWithPhone: (phoneNumber: string) => Promise<ConfirmationResult | null>;
  updateUserProfile: (data: UpdateData) => Promise<void>;
  linkWithGoogle: () => Promise<void>;
  linkWithFacebook: () => Promise<void>;
  triggerSync: () => void; // Add this to allow manual sync trigger
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

// A global RecaptchaVerifier instance.
// It's important to have only one instance that can be reused.
let recaptchaVerifier: RecaptchaVerifier | null = null;

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({ state: 'loading' });
  const [syncTrigger, setSyncTrigger] = useState(0);

  const triggerSync = useCallback(() => {
    setSyncTrigger(count => count + 1);
  }, []);

  const forceUserUpdate = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      // Reload the user to get the latest profile data from Firebase servers.
      await currentUser.reload();
      // Use the reloaded user object to ensure the state update has the latest data.
      setAuthState({ state: 'authenticated', user: { ...auth.currentUser! } });
    }
  }, []);

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        // Use signInWithRedirect for initial sign-ins
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          setAuthState({ state: 'authenticated', user });
          toast.success(`Welcome, ${user.displayName}!`);
          triggerSync(); // Trigger a sync after redirect login
        }
      } catch (error: any) {
        console.error("Error processing redirect result:", error);
        if (error.code === 'auth/account-exists-with-different-credential') {
          toast.error("Sign-In Failed", {
            description: 'An account already exists with this email. Please sign in with the original method.'
          });
        } else {
          toast.error("Sign-In Error", {
            description: "There was a problem during the sign-in process."
          });
        }
      }
    };
    
    handleRedirect();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthState({ state: 'authenticated', user });
      } else {
        setAuthState({ state: 'unauthenticated' });
      }
    });

    return () => unsubscribe();
  }, [triggerSync]);


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // State will be updated by onAuthStateChanged listener
      toast.success('You have been signed out.');
    } catch (error) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithProvider = async (provider: GoogleAuthProvider | FacebookAuthProvider) => {
    try {
      // For a clean sign-in, use a popup. Redirect can be confusing for users.
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle the success case
    } catch (error: any) {
       if (error.code === 'auth/popup-closed-by-user') {
        toast.info("Sign-in cancelled", {
          description: "The sign-in window was closed before completion."
        });
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        toast.error("Sign-In Failed", {
          description: 'An account already exists with this email. Please sign in with the original method.'
        });
      } else {
        console.error("Sign-in error:", error);
        toast.error("Sign-In Failed", {
          description: error.message || "Could not complete the sign-in process."
        });
      }
    }
  };


  const signInWithGoogle = () => signInWithProvider(new GoogleAuthProvider());
  const signInWithFacebook = () => signInWithProvider(new FacebookAuthProvider());
  
  const signInWithTikTok = async () => {
    // Redirect logic is now handled by a server route via an `<a>` tag.
    // This function can be kept for consistency or removed if the button is always a link.
    console.log("Initiating TikTok sign-in via server-side redirect...");
  };

  const signInWithCustomToken = useCallback(async (token: string) => {
    try {
      const userCredential = await firebaseSignInWithCustomToken(auth, token);
      const user = userCredential.user;
      setAuthState({ state: 'authenticated', user });
      toast.success(`Welcome, ${user.displayName || 'TikTok User'}!`);
      triggerSync();
    } catch (error) {
      console.error('Error signing in with custom token:', error);
      toast.error('Sign-in failed.', {
        description: 'There was a problem signing in with the provided credentials.',
      });
    }
  }, [triggerSync]);

  const signInWithPhone = async (phoneNumber: string): Promise<ConfirmationResult | null> => {
    try {
        if (!recaptchaVerifier) {
            recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible',
                'callback': (response: any) => {
                },
                'expired-callback': () => {
                   toast.error("reCAPTCHA expired. Please try again.");
                }
            });
        }
        
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
        
        return confirmationResult;

    } catch (error: any)
     {
        console.error("SMS sign-in error:", error);
        toast.error("Failed to Send Code", {
            description: error.message || "An unknown error occurred."
        });
        if (recaptchaVerifier) {
            recaptchaVerifier.clear();
            recaptchaVerifier = null;
        }
        return null;
    }
  };

  const updateUserProfile = async (data: UpdateData) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error("No user is currently signed in.");
    }
    try {
        await updateProfile(currentUser, data);
        // Force a state update to make the UI reactive.
        // onAuthStateChanged does not fire for profile updates.
        forceUserUpdate();
    } catch (error) {
        console.error("Error updating user profile:", error);
        throw error;
    }
  };

  const linkWithProvider = async (provider: GoogleAuthProvider | FacebookAuthProvider) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error("No user is currently signed in to link an account.");
    }
    try {
        await linkWithPopup(currentUser, provider);
        // After linking, force a reload of the user to get the updated profile info
        await forceUserUpdate();
    } catch (error: any) {
        if (error.code === 'auth/popup-closed-by-user') {
            // This is not a critical error, just the user cancelling.
            toast.info("Connection cancelled", {
                description: "The connection window was closed before completion."
            });
        } else {
            console.error("Error linking account:", error);
            // Re-throw the error to be handled by the component
            throw error;
        }
    }
  };

  const linkWithGoogle = () => linkWithProvider(new GoogleAuthProvider());
  const linkWithFacebook = () => linkWithProvider(new FacebookAuthProvider());

  const value = {
    user: authState.state === 'authenticated' ? authState.user : null,
    authState,
    signOut,
    signInWithGoogle,
    signInWithFacebook,
    signInWithTikTok,
    signInWithCustomToken,
    signInWithPhone,
    updateUserProfile,
    linkWithGoogle,
    linkWithFacebook,
    triggerSync, // Expose the trigger
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
