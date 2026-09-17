import React from 'react';
import type { ReadingResolver } from '@/types';
import { PageHeader } from '@/ui';
import { LearningPath } from '../components/LearningPath';
import { useSession } from '@/platform/session';

export const LearnPage: React.FC<{ readingFor?: ReadingResolver }> = ({ readingFor }) => {
  const { stages } = useSession();
  const cleared = stages.filter((s) => s.state === 'Completed').length;

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Learning path"
        title="Your path, staged"
        description="Ten stages. Finish a stage's lessons, pass its coding test, and the next one opens."
        aside={
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-gray-900 dark:text-white">
              {cleared}
              <span className="text-gray-400 text-xl"> / {stages.length}</span>
            </div>
            <div className="text-xs text-gray-500">stages cleared</div>
          </div>
        }
      />
      <LearningPath readingFor={readingFor} />
    </div>
  );
};
