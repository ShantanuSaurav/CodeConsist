import React from 'react';
import { LearnPage } from '@/modules/challenges';
import { resolveReading } from '@/modules/articles';

/** The learning path, with the articles module supplying each stage's reading link. */
export const LearnRoute: React.FC = () => <LearnPage readingFor={resolveReading} />;
