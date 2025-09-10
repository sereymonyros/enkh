
'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const FEATURES = [
  'កម្មវិធីនេះត្រូវបានបង្កើតឡើងសម្រាប់ជាប្រយោជន៍ដល់សហគមន៍កម្ពុជា និងជនបរទេស។ មួយរយៈទៀត វានឹងល្អជាង Google Translator។ សូមជួយខ្ញុំសាកល្បងវា។',  
  'Next week features(លក្ខណៈពិសេសសប្តាហ៍ក្រោយ)',
  '1) អត្ថបទ​ទៅ​ជា​សំឡេង',
  '2) សំឡេងទៅអត្ថបទ',  
  '3) រូបភាពទៅអក្សរ',
  '4) រូបភាពទៅជាសំឡេង',
  
];

type WelcomeToastProps = {
  historyLength: number;
};


export function WelcomeToast({ historyLength }: WelcomeToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Function to start the fade-out process
    const startFadeOut = () => {
      setIsFadingOut(true);
      // After the fade-out animation completes (500ms), remove the component
      const removeTimer = setTimeout(() => {
        setIsVisible(false);
      }, 500);
      return () => clearTimeout(removeTimer);
    };

    // Show the toast on initial mount
    const fadeInTimer = setTimeout(() => {
      setIsVisible(true);
    }, 100);

    // If history has items, fade out immediately
    if (historyLength > 0) {
      startFadeOut();
      return; // Stop further processing
    }

    // Otherwise, set a 15-second timer to fade out
    const fadeOutTimer = setTimeout(() => {
      startFadeOut();
    }, 15000);

    // Cleanup timers on component unmount or when historyLength changes
    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(fadeOutTimer);
    };
  }, [historyLength]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="welcome-toast-container">
      <div
        className={cn(
          'welcome-toast',
          'transition-opacity duration-500 ease-in-out',
          isFadingOut ? 'opacity-0' : 'opacity-100'
        )}
      >
        <ul>
          {FEATURES.map((feature, index) => (
            <li key={index}>{feature}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
