import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import '@/assets/tailwind.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster
      theme="system"
      position="bottom-left"
      toastOptions={{ style: { background: "var(--raised)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 12 } }}
    />
  </React.StrictMode>,
);
