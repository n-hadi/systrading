import React from 'react';
import { createRoot } from 'react-dom/client';

import './styles/terminal.css';

import Terminal from './Terminal.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Terminal />
  </React.StrictMode>,
);
