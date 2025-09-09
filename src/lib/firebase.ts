// Import the functions you need from the SDKs you need
import {initializeApp, getApp, getApps} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'API_KEY',
  authDomain: 'st-proj-172175026493.firebaseapp.com',
  projectId: 'st-proj-172175026493',
  storageBucket: 'st-proj-172175026493.appspot.com',
  messagingSenderId: '929428544391',
  appId: '1:929428544391:web:96e4599c93ad6b3e6601b3',
  measurementId: 'G-M90NEX3J20',
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export {app, db};
