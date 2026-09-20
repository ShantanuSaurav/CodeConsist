import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { STORAGE_KEYS, readString, writeString } from '@/platform/storage/storage';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { SocialProof } from '../components/SocialProof';
import { HowItWorks } from '../components/HowItWorks';
import { LearningExperience } from '../components/LearningExperience';
import { Gamification } from '../components/Gamification';
import { FinalCTA } from '../components/FinalCTA';
import { Footer } from '../components/Footer';
import { WelcomeIntro } from '../components/WelcomeIntro';

/**
 * "/" - the public entry point.
 *
 * The first visit in a browser opens on the welcome intro (the mark, the
 * name, the tagline, "Enter Devlingo"). Entering goes to the existing
 * /dashboard route - signed-in learners land on their dashboard, guests on
 * the guest flow with its sign-in prompt - so no second home page exists.
 * The intro is remembered in localStorage and never replays; after that "/"
 * is the landing page it always was, and the intro's quiet second action
 * ("learn more first") reveals that same page in place.
 */
export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [intro, setIntro] = useState(() => readString(STORAGE_KEYS.intro) !== '1');

  const markSeen = useCallback(() => writeString(STORAGE_KEYS.intro, '1'), []);

  const enter = useCallback(() => {
    markSeen();
    navigate(ROUTES.dashboard);
  }, [markSeen, navigate]);

  const explore = useCallback(() => {
    markSeen();
    setIntro(false);
  }, [markSeen]);

  if (intro) return <WelcomeIntro onEnter={enter} onExplore={explore} />;

  return (
    <div className="bg-bg min-h-screen text-fg">
      <Navbar />
      <Hero />
      <SocialProof />
      <HowItWorks />
      <LearningExperience />
      <Gamification />
      <FinalCTA />
      <Footer />
    </div>
  );
};
