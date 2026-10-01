import React from 'react';
import { PageHeader } from '@/ui';
import { Playground } from '../components/Playground';

export const PlaygroundPage: React.FC = () => (
  <div className="page max-w-6xl">
    <PageHeader
      eyebrow="Playground"
      title="Scratchpad"
      description="JavaScript runs in a sandboxed Node process (or a Web Worker when the API is offline). Python is CPython compiled to WebAssembly. HTML, CSS and JavaScript render live in a sandboxed page. Java, C and C++ are compiled and run by real compilers on the server. Nothing is simulated."
    />
    <Playground />
  </div>
);
