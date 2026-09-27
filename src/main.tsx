import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerShareServiceWorker} from './utils/shareTarget';

// تسجيل الـ Service Worker المسؤول عن استقبال المشاركات من واتساب
registerShareServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
