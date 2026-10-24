import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// Tras un nuevo deploy los chunks antiguos desaparecen; recargar una vez para obtener el index.html nuevo.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('chunk-reload') !== '1') {
    sessionStorage.setItem('chunk-reload', '1');
    window.location.reload();
  }
});
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('chunk-reload'), 5000));

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
