
'use client';

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { HistoryEntryForClient } from '@/ai/flows/get-history';

// Define the schema for our database.
interface EnkhDB extends DBSchema {
  translations: {
    key: string;
    value: {
      normalizedText: string;
      sourceLanguage: 'en' | 'km';
      targetLanguage: 'en' | 'km';
      translatedText: string;
      createdAt: Date;
    };
    indexes: { 'text-source-target': [string, string, string] };
  };
  history: {
    key: string; // The user's UID
    value: {
      userId: string;
      items: HistoryEntry[];
    }
  };
}

export interface HistoryEntry {
  id: number; // Using a number for simplicity with auto-incrementing
  firestoreId?: string; // To track the corresponding Firestore doc ID
  originalText: string;
  translatedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
  createdAt: number; // Store as timestamp (milliseconds)
}


let dbPromise: Promise<IDBPDatabase<EnkhDB>> | null = null;

const getDb = (): Promise<IDBPDatabase<EnkhDB>> => {
    if (!dbPromise) {
        dbPromise = openDB<EnkhDB>('enkh-db', 3, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    const translationsStore = db.createObjectStore('translations', {
                        keyPath: 'key',
                    });
                    translationsStore.createIndex('text-source-target', [
                        'normalizedText',
                        'sourceLanguage',
                        'targetLanguage',
                    ]);
                }
                if (oldVersion < 2) {
                     db.createObjectStore('history', {
                        keyPath: 'userId',
                    });
                }
                 if (oldVersion < 3) {
                    if (db.objectStoreNames.contains('history')) {
                        db.deleteObjectStore('history');
                    }
                    const historyStore = db.createObjectStore('history', {
                      keyPath: 'id',
                      autoIncrement: true,
                    });
                    historyStore.createIndex('by-user', 'userId');
                }
            },
        });
    }
    return dbPromise;
};


const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export async function saveTranslationToDb(
  originalText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km',
  translatedText: string
): Promise<void> {
  const db = await getDb();
  const normalizedOriginal = normalizeText(originalText);
  const key = `${normalizedOriginal}:${sourceLanguage}:${targetLanguage}`;

  await db.put('translations', {
    key,
    normalizedText: normalizedOriginal,
    sourceLanguage,
    targetLanguage,
    translatedText,
    createdAt: new Date(),
  });
}

export async function getTranslationFromDb(
  originalText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km'
): Promise<{ translatedText: string; createdAt: Date } | null> {
  const db = await getDb();
  const normalizedOriginal = normalizeText(originalText);
  const key = `${normalizedOriginal}:${sourceLanguage}:${targetLanguage}`;
  
  const result = await db.get('translations', key);

  return result ? { translatedText: result.translatedText, createdAt: result.createdAt } : null;
}


// --- HISTORY FUNCTIONS ---

export async function addHistoryItem(userId: string, item: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<number> {
    const db = await getDb();
    const newEntry: Omit<HistoryEntry, 'id'> = {
      ...item,
      userId,
      createdAt: Date.now(),
    };
    const id = await db.add('history', newEntry);
    return id;
}

export async function updateHistoryItemWithFirestoreId(itemId: number, firestoreId: string): Promise<void> {
    const db = await getDb();
    const item = await db.get('history', itemId);
    if (item) {
        await db.put('history', { ...item, firestoreId });
    }
}


export async function getHistoryForUser(userId: string): Promise<HistoryEntry[]> {
    const db = await getDb();
    const items = await db.getAllFromIndex('history', 'by-user', userId);
    // Sort descending by creation date
    return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearHistoryForUser(userId: string): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('history', 'readwrite');
    const index = tx.store.index('by-user');
    let cursor = await index.openCursor(userId);
    while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
    }
    await tx.done;
}

export async function mergeFirestoreHistory(userId: string, firestoreHistory: HistoryEntryForClient[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('history', 'readwrite');

    for (const firestoreEntry of firestoreHistory) {
        // Check if an entry with this firestoreId already exists
        const existing = await tx.store.get(firestoreEntry.id as any); // Assuming firestore doc ID is the key
        
        if (!existing) {
             // A simplified conversion. A more robust solution might use a proper mapping.
            const localEntry: HistoryEntry = {
                id: firestoreEntry.id as any, // Use firestore ID as local key for simplicity if it's unique
                firestoreId: firestoreEntry.id,
                originalText: firestoreEntry.originalText,
                translatedText: firestoreEntry.translatedText,
                sourceLanguage: firestoreEntry.sourceLanguage,
                targetLanguage: firestoreEntry.targetLanguage,
                createdAt: firestoreEntry.createdAt, // This is already a number (millis)
            };
            // Use put instead of add to handle potential key conflicts gracefully
            await tx.store.put(localEntry as any);
        }
    }
    await tx.done;
}
