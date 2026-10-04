import React, { useEffect, useState } from 'react';

interface AvatarProps {
  /** A picture; the name's initial stands in when there is none or it fails to load. */
  src?: string | null;
  /** Whose avatar: the accessible name, and the source of the initial. */
  name: string;
  /** sm 24px, md 32px, lg 40px. */
  size?: 'sm' | 'md' | 'lg';
  /** Hidden from screen readers, when the name is already written beside it. */
  decorative?: boolean;
  className?: string;
}

const PX = { sm: 24, md: 32, lg: 40 } as const;

/** A round picture of a person, or the first letter of their name. */
export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md', decorative = false, className = '' }) => {
  const [failed, setFailed] = useState(false);
  // A new picture gets a fresh try.
  useEffect(() => setFailed(false), [src]);
  const px = PX[size];
  // Array.from, so an initial outside the BMP (an emoji) is not cut in half.
  const initial = (Array.from(name.trim())[0] ?? '?').toUpperCase();
  return (
    <span
      className={`avatar ${className}`.trim()}
      style={{ width: px, height: px, fontSize: Math.round(px * 0.42) }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      {src && !failed ? (
        <img src={src} alt="" width={px} height={px} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
};
