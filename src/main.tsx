import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initApiConfig } from './config/api'

// Initialize API configuration then render the app
async function initializeApp() {
  await initApiConfig();
  
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

initializeApp();