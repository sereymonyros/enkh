// This file contains the initial data to "seed" the user's local IndexedDB.
// Pre-populating the database with common phrases has two main benefits:
// 1.  Cost Savings: The most common translations will never need to hit the API, saving money.
// 2.  Improved First Use: A new user immediately has offline access to these common
//     phrases without needing to build up their own cache first.

// We define a simple type for our seed data entries for type safety.
export type SeedEntry = {
  en: string;
  km: string;
};

// This is our list of common phrases.
// We can easily add or remove phrases here in the future.
export const seedData: SeedEntry[] = [
  { en: "Hello", km: "សួស្តី" },
  { en: "Goodbye", km: "លាហើយ" },
  { en: "Thank you", km: "អរគុណ" },
  { en: "Sorry", km: "សុំទោស" },
  { en: "Yes", km: "បាទ / ចាស" },
  { en: "No", km: "ទេ" },
  { en: "How are you?", km: "អ្នក​សុខសប្បាយ​ទេ?" },
  { en: "I am fine", km: "ខ្ញុំ​សុខសប្បាយ" },
  { en: "What is your name?", km: "តើ​អ្នក​មាន​ឈ្មោះ​អ្វី?" },
  { en: "My name is...", km: "ខ្ញុំ​ឈ្មោះ..." },
  { en: "Please", km: "សូម" },
  { en: "Excuse me", km: "Excuse me" },
  { en: "I don't understand", km: "ខ្ញុំ​មិន​យល់​ទេ" },
  { en: "Water", km: "ទឹក" },
  { en: "Food", km: "អាហារ" },
  { en: "Help", km: "ជួយ" },
  { en: "One", km: "មួយ" },
  { en: "Two", km: "ពីរ" },
  { en: "Three", km: "បី" },
  { en: "Love", km: "ស្រឡាញ់" },
];
