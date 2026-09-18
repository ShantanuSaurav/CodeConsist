import React from 'react';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { SocialProof } from '../components/SocialProof';
import { HowItWorks } from '../components/HowItWorks';
import { LearningExperience } from '../components/LearningExperience';
import { Gamification } from '../components/Gamification';
import { FinalCTA } from '../components/FinalCTA';
import { Footer } from '../components/Footer';

export const Landing: React.FC = () => (
  <div className="bg-white dark:bg-[#0d1117] min-h-screen text-gray-900 dark:text-white font-sans selection:bg-[var(--color-primary)]/30">
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
