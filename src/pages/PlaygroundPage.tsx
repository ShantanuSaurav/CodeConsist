import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { EditorShowcase } from '../components/EditorShowcase';

export const PlaygroundPage: React.FC = () => (
  <div className="p-6 sm:p-8 max-w-7xl mx-auto">
    <PageHeader
      eyebrow="Playground"
      title="Run real code, right here"
      description="JavaScript runs in a sandboxed Node process (or a Web Worker when the API is offline). Python is CPython compiled to WebAssembly. Nothing is simulated."
    />
    <EditorShowcase />
  </div>
);
