import React from 'react';
import ReactDOM from 'react-dom/client';
// The stylesheet must load before any module CSS: it declares the cascade
// layer order (theme, base, components, utilities), and a module stylesheet
// that mentions `@layer components` first would put components below base.
import './index.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
