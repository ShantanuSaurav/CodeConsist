import React, { useEffect, useRef } from 'react';
import { CODECONSIST_LOGO_LAYERS } from '@/ui/brand/logoLayers';

/** Pointer motion runs outside React, at the display's refresh rate, only while settling. */
export const CinematicMark: React.FC = () => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const mark = markRef.current;
    const cursor = cursorRef.current;
    if (!scene || !mark || !cursor) return;
    const media = window.matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)');
    let visible = false;
    let frame = 0;
    let previous = 0;
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;
    let bounds: DOMRect | null = null;
    const paint = () => {
      mark.style.transform = `perspective(900px) rotateX(${-y * 7}deg) rotateY(${x * 9}deg)`;
      cursor.style.transform = `translate3d(${x * 22}px, ${y * 18}px, 0)`;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      x = y = targetX = targetY = 0;
      mark.style.transform = '';
      cursor.style.transform = '';
      scene.classList.remove('is-tracking');
    };
    const tick = (now: number) => {
      const dt = previous ? Math.min(now - previous, 50) : 16;
      previous = now;
      // Time-based damping behaves consistently on 60, 120 and 144 Hz displays.
      const blend = 1 - Math.exp(-dt / 75);
      x += (targetX - x) * blend;
      y += (targetY - y) * blend;
      paint();
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.001) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        previous = 0;
        if (!targetX && !targetY) scene.classList.remove('is-tracking');
      }
    };
    const start = () => {
      if (!frame && visible && media.matches && !document.hidden) {
        scene.classList.add('is-tracking');
        frame = requestAnimationFrame(tick);
      }
    };
    const enter = () => { bounds = scene.getBoundingClientRect(); };
    const move = (event: PointerEvent) => {
      if (!media.matches || !visible || document.hidden || event.pointerType !== 'mouse') return;
      bounds ??= scene.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      start();
    };
    const leave = () => { targetX = targetY = 0; start(); };
    const invalidate = () => { bounds = null; };
    const availability = () => {
      scene.classList.toggle('is-visible', visible && !document.hidden);
      if (!media.matches || document.hidden) stop();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      availability();
      if (!visible) stop();
    });
    observer.observe(scene);
    scene.addEventListener('pointerenter', enter);
    scene.addEventListener('pointermove', move, { passive: true });
    scene.addEventListener('pointerleave', leave);
    window.addEventListener('resize', invalidate, { passive: true });
    window.addEventListener('scroll', invalidate, { passive: true });
    document.addEventListener('visibilitychange', availability);
    media.addEventListener('change', availability);
    return () => {
      stop();
      observer.disconnect();
      scene.removeEventListener('pointerenter', enter);
      scene.removeEventListener('pointermove', move);
      scene.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate);
      document.removeEventListener('visibilitychange', availability);
      media.removeEventListener('change', availability);
    };
  }, []);

  return (
    <div ref={sceneRef} className="brand-scene" aria-hidden="true">
      <div className="brand-scene-grid" />
      <div className="brand-halo" />
      <div className="brand-orbit brand-orbit-one" />
      <div className="brand-orbit brand-orbit-two" />
      <span className="brand-coordinate">IDEAS INTO ABILITIES</span>
      <div className="brand-float">
        <div ref={markRef} className="brand-mark">
          {CODECONSIST_LOGO_LAYERS.map((layer, index) => (
            <div key={layer.id} ref={layer.id === 'cursor' ? cursorRef : undefined} className={`brand-layer-position brand-layer-position--${layer.id}`}>
              <img src={layer.src} alt="" width={640} height={512} decoding="async" draggable={false}
                className={`brand-layer brand-layer--${layer.id}`} style={{ '--layer': index } as React.CSSProperties} />
            </div>
          ))}
        </div>
      </div>
      <span className="brand-code brand-code-one">&lt;learn /&gt;</span>
      <span className="brand-code brand-code-two">build();</span>
      <div className="brand-scene-caption"><span /> LEARN. PRACTICE. BUILD.</div>
    </div>
  );
};
