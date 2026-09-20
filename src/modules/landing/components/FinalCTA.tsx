import React from 'react';
import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/ui';

export const FinalCTA: React.FC = () => (
  <section className="border-t border-border bg-surface">
    <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
      <div className="max-w-xl">
        <h2 className="text-[1.75rem] sm:text-[2.25rem] font-semibold tracking-tight text-fg leading-tight">
          Open the first stage. It takes about twenty minutes.
        </h2>
        <p className="mt-4 text-fg-secondary text-lg leading-relaxed">
          No account needed to start. Progress is saved in your browser and merged into an account whenever you sign in.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 shrink-0">
        <ButtonLink to="/dashboard/learn" variant="primary" size="lg">
          Start Stage 01 <ArrowRight size={15} />
        </ButtonLink>
        <ButtonLink to="/dashboard/practice" variant="secondary" size="lg">
          Open the playground
        </ButtonLink>
      </div>
    </div>
  </section>
);
