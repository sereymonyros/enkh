// This file is machine-generated - edit at your own risk.

'use server';

/**
 * @fileOverview Text translation flow between English and Khmer.
 *
 * - translateText - A function that translates text between English and Khmer.
 * - TranslateTextInput - The input type for the translateText function.
 * - TranslateTextOutput - The return type for the translateText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  limit,
} from 'firebase/firestore';
import {db} from '@/lib/firebase';

const translationsCollection = collection(db, 'translations');

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

const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async input => {
    // Cache lookup
    const q = query(
      translationsCollection,
      where('originalText', '==', input.text),
      where('sourceLanguage', '==', input.sourceLanguage),
      where('targetLanguage', '==', input.targetLanguage),
      limit(1)
    );
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return {translatedText: doc.data().translatedText};
    }

    // Cache miss, call the API
    const {output} = await prompt(input);
    if (output) {
      // Populate the cache
      await addDoc(translationsCollection, {
        originalText: input.text,
        translatedText: output.translatedText,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
      });
    }

    return output!;
  }
);
