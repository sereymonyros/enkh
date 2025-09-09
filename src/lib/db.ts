import { openDB, DBSchema } from 'idb';

const DB_NAME = 'enkh-db';
const DB_VERSION = 1;
const STORE_NAME = 'translations';

interface TranslationEntry {
  normalizedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
  translatedText: string;
  createdAt: Date;
}

interface EnkhDB extends DBSchema {
  [STORE_NAME]: {
    key: [string, 'en' | 'km', 'en' | 'km'];
    value: TranslationEntry;
    indexes: { 'by-query': [string, 'en' | 'km', 'en' | 'km'] };
  };
}

const dbPromise = openDB<EnkhDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    const store = db.createObjectStore(STORE_NAME, {
      keyPath: ['normalizedText', 'sourceLanguage', 'targetLanguage'],
    });
    store.createIndex('by-query', ['normalizedText', 'sourceLanguage', 'targetLanguage']);
  },
});

export async function getTranslationFromDb(
  normalizedText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km'
): Promise<string | null> {
  const db = await dbPromise;
  const result = await db.get(STORE_NAME, [normalizedText, sourceLanguage, targetLanguage]);
  return result?.translatedText ?? null;
}

export async function saveTranslationToDb(
  normalizedText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km',
  translatedText: string
): Promise<void> {
  const db = await dbPromise;
  await db.put(STORE_NAME, {
    normalizedText,
    sourceLanguage,
    targetLanguage,
    translatedText,
    createdAt: new Date(),
  });
}
