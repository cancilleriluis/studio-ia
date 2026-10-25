import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/bebas-neue';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
