import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { STORAGE_KEYS, remove } from '@/platform/storage/storage';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { SocialProof } from '../components/SocialProof';
import { HowItWorks } from '../components/HowItWorks';
import { LearningExperience } from '../components/LearningExperience';
import { Gamification } from '../components/Gamification';
import { FinalCTA } from '../components/FinalCTA';
import { Footer } from '../components/Footer';
import { WelcomeIntro } from '../components/WelcomeIntro';
import '../styles/landing.css';

/** Session-only memory - the intro should greet every visit, not just the first one ever. */
const introSeen = () => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEYS.intro) === '1';
  } catch {
    return false;
  }
};
const rememberIntro = () => {
  try {
    window.sessionStorage.setItem(STORAGE_KEYS.intro, '1');
  } catch {
    /* private mode or blocked storage: the intro simply plays again */
  }
};
/**
 * "/" - the public entry point.
 *
 * Opening the site shows the welcome intro (the mark, the name, the tagline,
 * "Enter CodeConsist"). Entering goes to the existing /dashboard route -
 * signed-in learners land on their dashboard, guests on the guest flow with
 * its sign-in prompt - so no second home page exists. The intro's quiet
 * second action ("learn more first") reveals the landing page in place.
 *
 * It is remembered per visit (sessionStorage): coming back to "/" inside the
 * same tab does not replay it, but the next time the site is opened it plays
 * again. An earlier build stored it in localStorage for good, which meant a
 * returning visitor never saw it; that key is cleared here.
 */
export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [intro, setIntro] = useState(() => {
    remove(STORAGE_KEYS.intro); // the old, permanent flag from a previous build
    return !introSeen();
  });

  const markSeen = useCallback(() => rememberIntro(), []);

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
    <div className="landing bg-bg min-h-screen text-fg">
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
