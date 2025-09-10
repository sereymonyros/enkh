
'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const FEATURES = [
  'text-to-speech',
  'voice-to-text',
  'voice-to-speech',
  'image-to-text',
  'image-to-speech',
];

export function WelcomeToast() {
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Start fade-in animation shortly after component mounts
    const fadeInTimer = setTimeout(() => {
      setIsVisible(true);
    }, 100); // 100ms delay to ensure initial state is rendered

    // Set a timer to start the fade-out process
    const fadeOutTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 5000); // 5 seconds visible time

    // Set a timer to completely remove the component from the DOM
    const removeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 5500); // 5.5 seconds total, allowing for 0.5s fade-out animation

    // Cleanup timers on component unmount
    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(fadeOutTimer);
      clearTimeout(removeTimer);
    };
  }, []);

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
