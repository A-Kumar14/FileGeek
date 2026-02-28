import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProviderWrapper } from './theme/ThemeContext';
import './tailwind.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { register as registerSW } from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProviderWrapper>
        <App />
      </ThemeProviderWrapper>
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();

// Enable offline-first caching in production builds.
registerSW();
