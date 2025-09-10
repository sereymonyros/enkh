
'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const CACHE_WARMER_FLAG = 'enkh_cache_warmed_v1';
// Warm the cache once every 24 hours
const CACHE_STALE_MS = 86400000; 

/**
 * An invisible component that "warms" the Firestore offline cache.
 * It runs a query against the 'translations' collection when the user is online.
 * This prompts the Firebase SDK to cache the results, making them available offline.
 */
export function CacheWarmer() {
  const [hasWarmed, setHasWarmed] = useState(false);

  useEffect(() => {
    const warmCache = async () => {
      // 1. Check if the user is online.
      if (!navigator.onLine) {
        console.log('CacheWarmer: Offline, skipping warm-up.');
        return;
      }
      
      // 2. Check if we've already warmed the cache recently.
      const lastWarmed = localStorage.getItem(CACHE_WARMER_FLAG);
      if (lastWarmed && (Date.now() - parseInt(lastWarmed, 10) < CACHE_STALE_MS)) {
        console.log('CacheWarmer: Cache has been warmed up recently. Skipping.');
        return;
      }

      console.log('CacheWarmer: Online and cache is stale. Warming up the translations cache...');
      
      try {
        // 3. Run a query against the 'translations' collection.
        // This query itself triggers the caching mechanism. We limit it to a reasonable number
        // to avoid downloading a massive amount of data on initial load.
        // The SDK is smart and will add to this cache over time with other queries.
        const q = query(collection(db, 'translations'), limit(200));
        
        // By executing getDocs, we are telling Firestore we're interested in this data.
        // The SDK, with persistence enabled, automatically caches the result.
        await getDocs(q);

        // 4. Set a flag in localStorage to prevent re-warming the cache on every page load.
        localStorage.setItem(CACHE_WARMER_FLAG, Date.now().toString());
        console.log('CacheWarmer: Successfully warmed up the cache.');
      } catch (error) {
        console.error('CacheWarmer: Failed to warm up cache.', error);
      } finally {
        setHasWarmed(true);
      }
    };
    
    // We only want this effect to run once
    if (!hasWarmed) {
        warmCache();
    }

  }, [hasWarmed]);

  // This component renders nothing.
  return null;
}

    