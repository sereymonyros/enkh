
'use client';
// This file manages all interactions with the browser's built-in IndexedDB database.
// It uses the 'idb' library, which is a small wrapper that makes IndexedDB easier to use.

import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Define constants for the database. This avoids magic strings in the code.
const DB_NAME = 'enkh-db'; // The name of our database.
const DB_VERSION = 1; // The version of our database schema.
const STORE_NAME = 'translations'; // The name of the "table" (called an object store) inside the DB.

// Define the structure of a single record (a translation entry) in our database.
// This is for TypeScript, to ensure type safety.
interface TranslationEntry {
  normalizedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
  translatedText: string;
  createdAt: Date;
}

// Define the entire database schema, including all its object stores and their indexes.
// Currently we only have one store: 'translations'.
interface EnkhDB extends DBSchema {
  [STORE_NAME]: {
    // The key is a "compound key" made of these three properties.
    // This ensures that each translation (e.g., "hello" from 'en' to 'km') is unique.
    key: [string, 'en' | 'km', 'en' | 'km'];
    // The value is the full TranslationEntry object.
    value: TranslationEntry;
    // We create an index for efficient lookups based on our query criteria.
    indexes: { 'by-query': [string, 'en' | 'km', 'en' | 'km'] };
  };
}

let dbPromise: Promise<IDBPDatabase<EnkhDB>> | null = null;

const getDb = () => {
  if (!dbPromise) {
    // Initialize the database connection only when it's first needed.
    // This lazy initialization prevents the code from running on the server.
    dbPromise = openDB<EnkhDB>(DB_NAME, DB_VERSION, {
      // The `upgrade` function is the only place where you can change the DB schema.
      // It runs only once when the database is first created, or when you increase the DB_VERSION number.
      upgrade(db) {
        // Create the 'translations' object store.
        const store = db.createObjectStore(STORE_NAME, {
          // Define the primary key for the store.
          keyPath: ['normalizedText', 'sourceLanguage', 'targetLanguage'],
        });
        // Create an index to allow us to query efficiently by the same fields as the key.
        store.createIndex('by-query', ['normalizedText', 'sourceLanguage', 'targetLanguage']);
      },
    });
  }
  return dbPromise;
}


/**
 * Retrieves a single translation from the local IndexedDB.
 * @param normalizedText The lowercase, trimmed text to look for.
 * @param sourceLanguage The source language of the text.
 * @param targetLanguage The target language for the translation.
 * @returns The full TranslationEntry object if found, otherwise null.
 */
export async function getTranslationFromDb(
  normalizedText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km'
): Promise<TranslationEntry | null> {
  const db = await getDb();
  // Use the `get` method with the compound key to find a specific record.
  const result = await db.get(STORE_NAME, [normalizedText, sourceLanguage, targetLanguage]);
  // Return the full entry if found, otherwise return null.
  return result ?? null;
}

/**
 * Saves a new translation to the local IndexedDB.
 * If a record with the same key already exists, it will be updated.
 * @param normalizedText The normalized original text.
 * @param sourceLanguage The source language.
 * @param targetLanguage The target language.
 * @param translatedText The translated text from the API.
 */
export async function saveTranslationToDb(
  normalizedText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km',
  translatedText: string
): Promise<void> {
  const db = await getDb();
  // Use the `put` method to add or update a record in the store.
  // This will overwrite any existing record with the same key, effectively updating the timestamp.
  await db.put(STORE_NAME, {
    normalizedText,
    sourceLanguage,
    targetLanguage,
    translatedText,
    createdAt: new Date(),
  });
}
