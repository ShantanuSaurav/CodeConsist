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
