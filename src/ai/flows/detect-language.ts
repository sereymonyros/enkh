
'use server';

/**
 * @fileOverview Language detection flow.
 *
 * - detectLanguage - A function that detects the language of a given text.
 * - DetectLanguageInput - The input type for the detectLanguage function.
 * - DetectLanguageOutput - The return type for the detect-language function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectLanguageInputSchema = z.object({
  text: z.string().describe('The text to analyze.'),
});
export type DetectLanguageInput = z.infer<typeof DetectLanguageInputSchema>;

const DetectLanguageOutputSchema = z.object({
  language: z.enum(['en', 'km', 'unknown']).describe("The detected language code ('en' for English, 'km' for Khmer, or 'unknown')."),
});
export type DetectLanguageOutput = z.infer<typeof DetectLanguageOutputSchema>;

export async function detectLanguage(input: DetectLanguageInput): Promise<DetectLanguageOutput> {
  return detectLanguageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectLanguagePrompt',
  input: {
    schema: DetectLanguageInputSchema,
  },
  output: {
    schema: DetectLanguageOutputSchema,
  },
  prompt: `You are a language detection expert. Your task is to identify whether the given text is English or Khmer.

If the text is English, respond with 'en'.
If the text is Khmer, respond with 'km'.
If the text is neither, or a mix, or you cannot determine the language, respond with 'unknown'.

Text to analyze: {{{text}}}
`,
});

const detectLanguageFlow = ai.defineFlow(
  {
    name: 'detectLanguageFlow',
    inputSchema: DetectLanguageInputSchema,
    outputSchema: DetectLanguageOutputSchema,
  },
  async input => {
    // Handle empty input gracefully.
    if (!input.text.trim()) {
      return { language: 'unknown' };
    }
    const {output} = await prompt(input);
    if (!output) {
      return { language: 'unknown' };
    }
    return output;
  }
);
