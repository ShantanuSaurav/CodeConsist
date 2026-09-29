import React from 'react';
import { TrackChoiceList } from '@/ui';

/** Which track - the shared track list, with the admin's words for a track, else its own tagline. */
export const TrackStep: React.FC<{
  tracks: Array<{ id: string; label: string; tagline?: string }>;
  blurbs: Record<string, string>;
  value: string | null;
  onChange: (id: string) => void;
}> = ({ tracks, blurbs, value, onChange }) => (
  <TrackChoiceList
    ariaLabel="Your track"
    layout="list"
    value={value}
    onChange={onChange}
    tracks={tracks.map((t) => ({
      id: t.id,
      label: t.label,
      description: (Object.prototype.hasOwnProperty.call(blurbs, t.id) ? blurbs[t.id] : '') || t.tagline || undefined
    }))}
  />
);
