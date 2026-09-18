import React from 'react';
import { RoadmapDetailPage } from '@/modules/roadmaps';
import { resolveReading } from '@/modules/articles';

/** One roadmap, with the articles module supplying each topic's reading link. */
export const RoadmapDetailRoute: React.FC = () => <RoadmapDetailPage readingFor={resolveReading} />;
