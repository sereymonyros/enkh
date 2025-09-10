
'use client';
/**
 * @fileOverview Client-side utilities for interacting with the shared translation cache in Firestore.
 */

import {
  collection,
  query,
  where,
  getDocs,
  limit,
  getDocsFromCache,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TranslateTextOutput } from '@/ai/flows/translate-text';

const translationsCollection = collection(db, 'translations');


/**
 * Retrieves a single translation from the local Firestore cache.
 * This function is designed to work offline by querying the data that the Firebase SDK
 * has persisted to the device.
 *
 * @param normalizedText The lowercase, trimmed text to look for.
 * @param sourceLanguage The source language of the text.
 * @param targetLanguage The target language for the translation.
 * @returns An object with the translated text if found, otherwise null.
 */
export async function getTranslationFromFirestoreCache(
  normalizedText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km'
): Promise<{ translatedText: string } | null> {

  // 1. Create a query to find the matching translation document.
  const q = query(
    translationsCollection,
    where('normalizedText', '==', normalizedText),
    where('sourceLanguage', '==', sourceLanguage),
    where('targetLanguage', '==', targetLanguage),
    limit(1)
  );

  try {
    // 2. Execute the query using getDocsFromCache.
    // This is the key part for the offline strategy. It FORCES the query
    // to only look at the local cache and not attempt a network request.
    const querySnapshot = await getDocsFromCache(q);

    // 3. Process the result.
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      const data = docSnap.data();
      // Return the translated text if a document was found.
      return { translatedText: data.translatedText };
    } else {
      // If no document was found in the cache, return null.
      return null;
    }
  } catch (error: any) {
    // This error block will be hit if the cache is empty or persistence is not enabled.
    // In our case, we know persistence is enabled, so this will primarily indicate a cache miss.
    if (error.code === 'unavailable') {
        console.warn('Firestore: Data not available in cache for this query.');
    } else {
        console.error('Firestore cache read error:', error);
    }
    // Return null on any error to indicate a cache miss.
    return null;
  }
}

    