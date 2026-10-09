import React, { useEffect } from 'react';
import { useContentStats, useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { SocialProof } from '../components/SocialProof';
import { HowItWorks } from '../components/HowItWorks';
import { LearningExperience } from '../components/LearningExperience';
import { Gamification } from '../components/Gamification';
import { FinalCTA } from '../components/FinalCTA';
import { Footer } from '../components/Footer';
import { PlaygroundStory, ReadingStory, RoadmapStory } from '../components/ProductStories';
import '../styles/landing.css';
import '../styles/premium.css';
import '../styles/cinematic.css';
import '../styles/glass.css';

/** "230+": lessons rounded down to a ten, as the build-time meta says them (scripts/content-stats.mjs). */
const lessonsLabel = (lessons: number) => (lessons >= 10 ? `${Math.floor(lessons / 10) * 10}+` : String(lessons));

/**
 * The page description, from the admin-editable `copy.meta.description`
 * filled with the live counts. index.html carries the build-time version for
 * crawlers that do not run scripts; this keeps it right once the page has
 * loaded, without a redeploy.
 */
function useMetaDescription(): void {
  const { contentReady } = useSession();
  const stats = useContentStats();
  const copy = useCopy();
  useEffect(() => {
    if (!contentReady || stats.lessons === 0) return;
    const text = copy('copy.meta.description', { lessons: lessonsLabel(stats.lessons), tests: stats.tests, stages: stats.stages, tracks: stats.tracks });
    const meta = document.querySelector('meta[name="description"]');
    if (meta && text) meta.setAttribute('content', text);
  }, [contentReady, stats, copy]);
}
/** Public home: the product is immediately available, without an intro gate. */
export const Landing: React.FC = () => {
  useMetaDescription();

  return (
    <div className="landing bg-bg min-h-screen text-fg">
      <a className="landing-skip" href="#main-content">Skip to content</a>
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <SocialProof />
        <RoadmapStory />
        <LearningExperience />
        <ReadingStory />
        <PlaygroundStory />
        <Gamification />
        <HowItWorks />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};
