import React from 'react';
import { ChallengesPage } from '@/modules/challenges';
import { resolveReading } from '@/modules/articles';

/** The challenge library, with the articles module supplying "read about this" links. */
export const ChallengesRoute: React.FC = () => <ChallengesPage readingFor={resolveReading} />;
