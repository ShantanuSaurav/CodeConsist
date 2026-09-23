import React from 'react';
import { PageHeader } from '@/ui';
import { Playground } from '../components/Playground';

export const PlaygroundPage: React.FC = () => (
  <div className="page max-w-6xl">
    <PageHeader
      eyebrow="Playground"
      title="Scratchpad"
      description="HTML, CSS and JavaScript render in a sandboxed frame in this browser. JavaScript runs in a sandboxed Node process (or a Web Worker when the API is offline). Python is CPython compiled to WebAssembly. Java, C and C++ compile through Judge0 when the server has one. Nothing is simulated."
    />
    <Playground />
  </div>
);
