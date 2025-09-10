
'use client';

import { OptimisticFeedback } from './feedback-store';

const CHANNEL_NAME = 'feedback_channel';
let channel: BroadcastChannel | null = null;

// Lazy initialization of the BroadcastChannel
// This ensures it's only created in a browser environment.
const getChannel = (): BroadcastChannel => {
  if (typeof window !== 'undefined') {
    if (!channel) {
      channel = new BroadcastChannel(CHANNEL_NAME);
    }
    return channel;
  }
  // Return a mock channel for server-side rendering or environments without window
  return {
    postMessage: () => {},
    onmessage: null,
    close: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    onmessageerror: null,
    name: CHANNEL_NAME,
  } as BroadcastChannel;
};

/**
 * Broadcasts a new optimistic feedback item to other tabs.
 * @param feedback The optimistic feedback item to send.
 */
export const broadcastFeedback = (feedback: OptimisticFeedback): void => {
  try {
    getChannel().postMessage(feedback);
  } catch (error) {
    console.error("Failed to broadcast feedback:", error);
    // This can happen if the object is not cloneable, but our feedback object is simple.
  }
};

/**
 * Listens for new optimistic feedback items from other tabs.
 * @param callback The function to execute when a message is received.
 * @returns An unsubscribe function to clean up the listener.
 */
export const addFeedbackListener = (
  callback: (feedback: OptimisticFeedback) => void
): (() => void) => {
  const channel = getChannel();
  
  const handleMessage = (event: MessageEvent): void => {
    // You might want to add validation here to ensure event.data is the correct type
    const feedback = event.data as OptimisticFeedback;
    if (feedback && feedback.id.startsWith('optimistic-')) {
        callback(feedback);
    }
  };

  channel.addEventListener('message', handleMessage);

  // Return a cleanup function
  return () => {
    channel.removeEventListener('message', handleMessage);
  };
};
