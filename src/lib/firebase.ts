// Import the functions you need from the SDKs you need
import {initializeApp, getApp, getApps} from 'firebase/app';
import {getFirestore, enableIndexedDbPersistence} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
// This configuration is PUBLIC and safe to expose in client-side code.
// Security is handled by Firebase Security Rules on the backend.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase for the client
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


// Enable offline persistence.
try {
    enableIndexedDbPersistence(db)
      .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Firestore persistence failed: multiple tabs open.');
        } else if (err.code == 'unimplemented') {
            console.warn('Firestore persistence not available in this browser.');
        }
    });
} catch (error) {
    console.error("Error enabling Firestore persistence:", error);
}

export {app, db, auth};
