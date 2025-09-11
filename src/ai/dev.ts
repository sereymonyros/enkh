import { config } from 'dotenv';
config();

import '@/ai/flows/translate-text.ts';
import '@/ai/flows/detect-language.ts';
import '@/ai/flows/clear-translations.ts';
import '@/ai/flows/save-history.ts';
import '@/ai/flows/get-history.ts';
