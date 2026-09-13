import React from 'react';
import { useGame } from '../context/GameContext';

export const Hero: React.FC = () => {
  const { openPractice } = useGame();

  return (
    <section className="hero">
      <p className="hero-eyebrow">CodeQuest — a daily practice for developers</p>

      <h1 className="hero-title">
        <span className="line">Learn.</span>
        <span className="line line-outline">Code.</span>
        <span className="line">Build.</span>
        <span className="line line-accent">Every day.</span>
      </h1>

      <div className="hero-foot">
        <p className="hero-sub">
          Fifteen minutes, one problem, real code. No slides, no videos — a path built around the way developers actually learn.
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-solid"
            onClick={() => openPractice()}
          >
            Start learning
          </button>
          <a href="#journey" className="btn btn-line">
            Explore the path
          </a>
        </div>
      </div>

      {/* Spline 3D Robot */}
      {/* @ts-expect-error - inert is in every current browser; React's typings lag. */}
      <div className="hero-spline-wrap" aria-hidden="true" inert="">
        <spline-viewer url="https://prod.spline.design/9951u9cumiw2Ehj8/scene.splinecode"></spline-viewer>
      </div>
    </section>
  );
};
