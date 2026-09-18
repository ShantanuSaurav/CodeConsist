import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/platform/theme';

interface PixelSnowProps {
  density?: number;
  speed?: number;
  size?: number;
  /** Particle colour. Defaults to the theme's primary at low opacity. */
  color?: string;
}

/** Drifting pixel particles behind the hero and the final call to action. */
export const PixelSnow: React.FC<PixelSnowProps> = ({ density = 50, speed = 1, size = 2, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const fill = color ?? (theme === 'dark' ? 'rgba(57, 255, 20, 0.15)' : 'rgba(22, 163, 11, 0.22)');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: { x: number; y: number; s: number; v: number; offset: number }[] = [];
    let animationFrameId = 0;
    let mouseX = 0;
    let isVisible = true;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    };

    const initParticles = () => {
      particles = [];
      const count = Math.floor((canvas.width * canvas.height) / (100000 / density));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          s: Math.floor(Math.random() * size) + 1,
          v: Math.random() * speed + 0.2,
          offset: Math.random() * 100
        });
      }
    };

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = rect?.width || window.innerWidth;
      canvas.height = rect?.height || window.innerHeight;
      initParticles();
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) isVisible = entry.isIntersecting;
    });
    observer.observe(canvas);

    const draw = () => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = fill;
      for (const p of particles) {
        if (!reduced) {
          p.y += p.v;
          p.x += Math.sin(p.y / 150 + p.offset) * 0.3 + mouseX * 0.5;
          if (p.y > canvas.height) {
            p.y = -p.s;
            p.x = Math.random() * canvas.width;
          }
          if (p.x > canvas.width) p.x = 0;
          if (p.x < 0) p.x = canvas.width;
        }
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.s, p.s);
      }
      if (!reduced) animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    resize();
    draw();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [density, speed, size, fill]);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" aria-hidden="true" />;
};
