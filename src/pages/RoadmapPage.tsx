import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { SkillRoadmap } from '../components/layout/SkillRoadmap';

export const RoadmapPage: React.FC = () => (
  <div className="p-6 sm:p-8 max-w-7xl mx-auto">
    <PageHeader
      eyebrow="Roadmap"
      title="Master the Stack"
      description="The skill tree from programming basics to system design and shipping. Each node fills in as you clear its lessons and its test - click one to jump in."
    />
    <SkillRoadmap />
  </div>
);
