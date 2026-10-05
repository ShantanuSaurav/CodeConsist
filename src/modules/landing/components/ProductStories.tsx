import React from 'react';
import { ArrowRight, BookOpen, TerminalSquare } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { ROUTES } from '@/config/routes';
import { ButtonLink, CodeBlock, ProgressBar, Reveal } from '@/ui';
import type { Challenge } from '@/types';
import { useNextChallenge } from './useNextChallenge';

const hasStarter = (challenge: Challenge) => Boolean(challenge.starterCode && challenge.starterCode.split('\n').length <= 16);

export const RoadmapStory: React.FC = () => {
  const { tracks } = useSession();
  return <section className="landing-story landing-roadmap-story">
    <div className="landing-story-inner">
      <Reveal className="landing-story-copy"><span className="eyebrow">01 / DIRECTION</span><h2>Know where<br />you’re going.</h2><p>Less time wondering what comes next. More time getting there. Choose a path and connect the dots, one concept at a time.</p><ButtonLink to={ROUTES.roadmaps} variant="ghost" className="story-link">Find your path <ArrowRight size={16} /></ButtonLink></Reveal>
      <Reveal className="landing-constellation" delay={100}><div className="constellation-root"><span aria-hidden="true">⌘</span> YOUR NEXT CHAPTER</div><div className="constellation-tracks">{tracks.map(({ track, cleared, total, stages }) => <div className="constellation-track" key={track.id}><div className="constellation-track-title"><span className="constellation-dot" /><h3>{track.label}</h3><small>{cleared} / {total} stages</small></div><ol>{stages.slice(0, 3).map((stage) => <li key={stage.id} className={stage.state === 'Completed' ? 'is-done' : ''}><span className="constellation-small-dot" /><span>{stage.name}</span></li>)}</ol><ProgressBar value={total ? cleared / total * 100 : 0} size="sm" label={`${cleared} of ${total} stages completed in ${track.label}`} /></div>)}</div></Reveal>
    </div>
  </section>;
};

export const ReadingStory: React.FC = () => {
  const { activeTrack, learnerStages } = useSession();
  const copy = useCopy();
  const stage = learnerStages.find((item) => item.state === 'In progress' || item.state === 'Test pending') ?? learnerStages[0];
  return <section className="landing-story landing-reading-story"><div className="landing-story-inner">
    <Reveal className="landing-reading-visual"><div className="reading-paper"><div className="reading-paper-top"><BookOpen size={20} /><span>THE READING ROOM</span></div><span className="eyebrow">{activeTrack.track.label}</span><h3>{stage?.name ?? 'Start with understanding.'}</h3><p>{stage?.description ?? copy('copy.landing.howLessons')}</p><div className="reading-paper-rule" /><p className="reading-paper-note">Read the idea.<br />Explore an example.<br /><em>Make it your own.</em></p><ButtonLink to={ROUTES.articles} variant="ghost">Explore the articles <ArrowRight size={15} /></ButtonLink></div></Reveal>
    <Reveal className="landing-story-copy"><span className="eyebrow">03 / UNDERSTANDING</span><h2>Beyond knowing<br />the syntax.</h2><p>See why the code works. Clear explanations connect the ideas to the things you’re building, so the next challenge feels like a natural next step.</p><ButtonLink to={ROUTES.articles} variant="ghost" className="story-link">Build your understanding <ArrowRight size={16} /></ButtonLink></Reveal>
  </div></section>;
};

export const PlaygroundStory: React.FC = () => {
  const sample = useNextChallenge(hasStarter)?.challenge;
  const copy = useCopy();
  return <section className="landing-story landing-playground-story"><div className="landing-story-inner">
    <Reveal className="landing-story-copy"><span className="eyebrow">04 / EXPLORATION</span><h2>Write. Run.<br /><span>What if?</span></h2><p>{copy('copy.playground.description')}</p><ButtonLink to={ROUTES.playground} variant="primary" size="lg">Open your playground <ArrowRight size={16} /></ButtonLink></Reveal>
    <Reveal className="landing-terminal" delay={100}><div className="landing-terminal-bar"><span className="terminal-dots" aria-hidden="true"><i /><i /><i /></span><span>{sample?.language ?? 'code'} / experiment</span><TerminalSquare size={16} /></div>{sample ? <CodeBlock code={sample.starterCode ?? ''} language={sample.language} showLineNumbers /> : <div className="landing-terminal-empty">Your next experiment starts here.</div>}<div className="landing-terminal-footer"><span className="workspace-live-dot" /> Starter code · Ready to explore <span aria-hidden="true">↵</span></div></Reveal>
  </div></section>;
};
