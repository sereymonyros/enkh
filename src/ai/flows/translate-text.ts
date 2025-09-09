
'use server';

/**
 * @fileOverview Text translation flow between English and Khmer.
 *
 * - translateText - A function that translates text between English and Khmer.
 * - TranslateTextInput - The input type for the translateText function.
 * - TranslateTextOutput - The return type for the translate-tsext function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import {db} from '@/lib/firebase';

const translationsCollection = collection(db, 'translations');

// Define a constant for the cache lifetime (30 days in milliseconds).
const CACHE_STALE_MS = 30 * 24 * 60 * 60 * 1000;

const TranslateTextInputSchema = z.object({
  text: z.string().describe('The text to translate.'),
  sourceLanguage: z.enum(['en', 'km']).describe('The source language of the text.'),
  targetLanguage: z.enum(['en', 'km']).describe('The target language for the translation.'),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

const TranslateTextOutputSchema = z.object({
  translatedText: z.string().describe('The translated text.'),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;

export async function translateText(input: TranslateTextInput): Promise<TranslateTextOutput> {
  return translateTextFlow(input);
}

const prompt = ai.definePrompt({
  name: 'translateTextPrompt',
  input: {
    schema: TranslateTextInputSchema,
  },
  output: {
    schema: TranslateTextOutputSchema,
  },
  prompt: `You are a translation expert. You will translate the given text from the source language to the target language.

Source Language: {{sourceLanguage}}
Target Language: {{targetLanguage}}
Text to translate: {{{text}}}

Translation:`,
});

const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async input => {
    // 1. NORMALIZE and VALIDATE INPUT (Security)
    // The server must be the source of truth for normalization.
    const normalizedText = normalizeText(input.text);
    if (!normalizedText) {
      // Handle empty input gracefully.
      return { translatedText: '' };
    }

    let staleDocId: string | null = null;

    // 2. CHECK SHARED CACHE (FIRESTORE)
    console.log('   -> 2a. FIRESTORE CHECK: Checking for translation in Firestore...');
    const q = query(
      translationsCollection,
      where('normalizedText', '==', normalizedText),
      where('sourceLanguage', '==', input.sourceLanguage),
      where('targetLanguage', '==', input.targetLanguage),
      limit(1)
    );
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      const data = docSnap.data();
      const createdAt = data.createdAt?.toDate(); // Convert Firestore Timestamp to JS Date

      if (createdAt) {
        const age = Date.now() - createdAt.getTime();
        // If the cache entry is fresh, return it immediately.
        if (age < CACHE_STALE_MS) {
          console.log('      ✅ FIRESTORE HIT (FRESH): Found fresh translation in Firestore. Flow complete.');
          return {translatedText: data.translatedText};
        } else {
          // If the entry is stale, mark it for update instead of creating a new one.
          console.log('      ⚠️ FIRESTORE HIT (STALE): Translation is older than 30 days. Will refresh.');
          staleDocId = docSnap.id;
        }
      } else {
        // If there's no timestamp, treat it as fresh but mark for update to add a timestamp.
        console.log('      ⚠️ FIRESTORE HIT (NO TIMESTAMP): Found translation but it has no timestamp. Will refresh.');
        staleDocId = docSnap.id;
      }
    } else {
      console.log('      ❌ FIRESTORE MISS: Not found in Firestore.');
    }

    // 3. FETCH FROM SOURCE OF TRUTH (AI API)
    // This part only runs if the cache is a MISS or STALE.
    console.log('   -> 2b. API CALL: Calling the AI translation API...');
    const {output} = await prompt({...input, text: normalizedText});
    if (!output) {
      throw new Error('Translation API returned no output.');
    }
    console.log('      ✅ API SUCCESS: Received translation from AI.');

    // 4. POPULATE CACHE
    // Write the fresh result back to Firestore.
    if (staleDocId) {
      // If we are refreshing a stale document, UPDATE the existing one.
      console.log('   -> 2c. FIRESTORE UPDATE: Updating stale translation in Firestore.');
      const docRef = doc(translationsCollection, staleDocId);
      await updateDoc(docRef, {
        translatedText: output.translatedText,
        createdAt: serverTimestamp(), // Update the timestamp to now.
      });
    } else {
      // If this is a completely new translation, ADD a new document.
      console.log('   -> 2c. FIRESTORE WRITE: Saving new translation with timestamp to Firestore.');
      await addDoc(translationsCollection, {
        normalizedText: normalizedText,
        translatedText: output.translatedText,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        createdAt: serverTimestamp(),
      });
    }

    // 5. RETURN RESULT
    return output;
  }
);
