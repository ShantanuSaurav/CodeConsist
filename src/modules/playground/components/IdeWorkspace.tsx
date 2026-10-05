import React, { useId, useState } from 'react';
import '../styles/workspace.css';

export const IdeWorkspace: React.FC<{ explorer: React.ReactNode; children: React.ReactNode }> = ({ explorer, children }) => {
  const [editorWidth, setEditorWidth] = useState(60);
  const id = useId();
  return (
    <div className="ide-workspace" style={{ '--editor-size': `${editorWidth}fr`, '--output-size': `${100 - editorWidth}fr` } as React.CSSProperties}>
      <div className="ide-workspace-bar">
        <span><span className="ide-workspace-dot" /> WORKSPACE</span>
        <label className="ide-resize" htmlFor={id}>Editor width
          <input id={id} type="range" min="35" max="75" value={editorWidth} onChange={(event) => setEditorWidth(Number(event.target.value))} aria-valuetext={editorWidth + '% editor width'} />
        </label>
        <span className="ide-workspace-hint">Your code. Your space.</span>
      </div>
      <aside className="ide-explorer" aria-label="Project files and examples">{explorer}</aside>
      {children}
    </div>
  );
};
