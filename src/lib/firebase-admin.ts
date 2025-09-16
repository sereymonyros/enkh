// This file is for SERVER-SIDE use only.
// It initializes the Firebase Admin SDK.

import admin from 'firebase-admin';

function initializeAdmin() {
  // If the app is already initialized, don't try to initialize it again.
  if (admin.apps.length > 0) {
    return;
  }

  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountString) {
    console.error('FIREBASE_SERVICE_ACCOUNT environment variable is not set. Admin SDK cannot be initialized.');
    return;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountString);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error: any) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT or initialize Firebase Admin SDK:', error.message);
  }
}

// Call the initialization function.
initializeAdmin();

/**
 * Returns the Firebase Admin Auth instance.
 * Returns null if the SDK has not been initialized.
 */
export function getAdminAuth() {
  if (admin.apps.length === 0) {
    return null;
  }
  return admin.auth();
}
