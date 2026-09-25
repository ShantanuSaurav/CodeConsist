import React from 'react';
import { PageHeader } from '@/ui';
import { Playground } from '../components/Playground';

export const PlaygroundPage: React.FC = () => (
  <div className="page max-w-6xl">
    <PageHeader
      eyebrow="Playground"
      title="Scratchpad"
      description="HTML, CSS and JavaScript render in a sandboxed frame in this browser. JavaScript runs in a sandbox on the CodeConsist server, or right here in your browser when the server is unavailable. Python is CPython compiled to WebAssembly. Java, C and C++ compile on the server when a compiler is set up for them. Nothing is simulated."
    />
    <Playground />
  </div>
);
