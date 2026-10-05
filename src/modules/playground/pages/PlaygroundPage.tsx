import React from 'react';
import { useCopy } from '@/platform/settings';
import { PageHeader } from '@/ui';
import { Playground } from '../components/Playground';

export const PlaygroundPage: React.FC = () => {
  // Admin-editable (`copy.playground.description`): what runs where, without
  // naming infrastructure.
  const copy = useCopy();
  return (
    <div className="page playground-page">
      <PageHeader eyebrow="Playground" title="Room to experiment." description={copy('copy.playground.description')} />
      <Playground />
    </div>
  );
};
