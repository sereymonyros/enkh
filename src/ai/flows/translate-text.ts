
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

// The lifetime of a cached translation on the server (Firestore), read from environment variables.
// Default to 30 days (in milliseconds) if not set.
const CACHE_STALE_MS = parseInt(process.env.CACHE_STALE_MS || '2592000000', 10);

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
    const normalizedTranslatedText = normalizeText(output.translatedText);
    console.log('      ✅ API SUCCESS: Received translation from AI.');

    // 4. POPULATE CACHE SYMMETRICALLY
    // Write the fresh result back to Firestore for both directions.

    // 4a. Update/Add the FORWARD translation (e.g., EN -> KM)
    if (staleDocId) {
      console.log('   -> 2c. FIRESTORE UPDATE (FORWARD): Updating stale translation in Firestore.');
      const docRef = doc(translationsCollection, staleDocId);
      await updateDoc(docRef, {
        translatedText: output.translatedText,
        createdAt: serverTimestamp(),
      });
    } else {
      console.log('   -> 2c. FIRESTORE WRITE (FORWARD): Saving new translation to Firestore.');
      await addDoc(translationsCollection, {
        normalizedText: normalizedText,
        translatedText: output.translatedText,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        createdAt: serverTimestamp(),
      });
    }

    // 4b. Add the REVERSE translation (e.g., KM -> EN).
    // We use a separate "put"-like operation for the reverse to keep it simple.
    // Check if the reverse translation already exists.
    const reverseQuery = query(
      translationsCollection,
      where('normalizedText', '==', normalizedTranslatedText),
      where('sourceLanguage', '==', input.targetLanguage),
      where('targetLanguage', '==', input.sourceLanguage),
      limit(1)
    );
    const reverseSnapshot = await getDocs(reverseQuery);
    if (reverseSnapshot.empty) {
        console.log('   -> 2d. FIRESTORE WRITE (REVERSE): Saving new reverse translation to Firestore.');
        await addDoc(translationsCollection, {
          normalizedText: normalizedTranslatedText,
          translatedText: input.text, // The original text is the translation in reverse
          sourceLanguage: input.targetLanguage,
          targetLanguage: input.sourceLanguage,
          createdAt: serverTimestamp(),
        });
    } else {
        console.log('   -> 2d. FIRESTORE UPDATE (REVERSE): Reverse translation already exists. Updating timestamp.');
        const reverseDocRef = doc(translationsCollection, reverseSnapshot.docs[0].id);
        await updateDoc(reverseDocRef, {
            createdAt: serverTimestamp() // Just update the timestamp to keep it fresh
        });
    }


    // 5. RETURN RESULT
    return output;
  }
);
