import React from 'react';
import { PracticeSessionProvider } from '../session/PracticeSessionProvider';
import { PracticeModal, type PracticeModalProps } from './PracticeModal';
import '../styles/practice.css';

/**
 * Mount once, around the routes: provides the practice session to this
 * module's pages and renders the modal above everything. Other modules open
 * it through the `practice:open` / `practice:openTest` events.
 */
export const PracticeHost: React.FC<PracticeModalProps & { children?: React.ReactNode }> = ({ readingSlot, children }) => (
  <PracticeSessionProvider>
    {children}
    <PracticeModal readingSlot={readingSlot} />
  </PracticeSessionProvider>
);
