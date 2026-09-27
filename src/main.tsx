import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerShareServiceWorker, waitForSharedOpus, wasOpenedFromShare, listenForShareReady} from './utils/shareTarget';

registerShareServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function putFileInPicker(file: File): boolean {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
  if (!inputs.length) return false;
  const input = inputs[0];
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (err) {
    console.warn('attach shared audio failed', err);
    return false;
  }
}

async function attachWhatsAppAudio() {
  if (typeof window === 'undefined') return;
  if (!wasOpenedFromShare()) return;

  const shared = await waitForSharedOpus({ attempts: 40, delayMs: 250 });
  if (!shared || !shared.file || shared.file.size <= 0) return;

  for (let i = 0; i < 25; i++) {
    if (putFileInPicker(shared.file)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

attachWhatsAppAudio();
listenForShareReady(() => {
  attachWhatsAppAudio();
});
