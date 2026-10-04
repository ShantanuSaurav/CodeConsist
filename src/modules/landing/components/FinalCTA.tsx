import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useContentStats } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { ButtonLink, Reveal } from '@/ui';

export const FinalCTA: React.FC = () => {
  // The heading is admin-editable (`copy.landing.finalCta`).
  const copy = useCopy();
  const stats = useContentStats();
  return (
    <section className="border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <Reveal>
          <div className="cta-panel flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="max-w-xl">
              <div className="eyebrow">Get started</div>
              <h2 className="text-[1.75rem] sm:text-[2.25rem] font-semibold tracking-tight text-fg leading-tight">
                {copy('copy.landing.finalCta', { ...stats })}
              </h2>
              <p className="mt-4 text-fg-secondary text-lg leading-relaxed">
                No account needed to start. Progress is saved in your browser and merged into an account whenever you sign in.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <ButtonLink to="/dashboard/learn" variant="primary" size="lg" className="cta-arrow">
                Start Stage 01 <ArrowRight size={15} />
              </ButtonLink>
              <ButtonLink to="/dashboard/practice" variant="secondary" size="lg">
                Open the playground
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
