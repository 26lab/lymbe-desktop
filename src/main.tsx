import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QuickAsk } from './QuickAsk';
import { Bubble } from './Bubble';
import './styles.css';

/**
 * Alle Fenster laden dasselbe Bundle. Welches Gesicht gezeigt wird, steht in
 * der URL (siehe tauri.conf.json):
 *
 *   ?window=quick   → Schnellfrage
 *   ?window=bubble  → schwebendes Symbol
 *   sonst           → Hauptfenster
 */
const windowKind = new URLSearchParams(window.location.search).get('window');

const root =
  windowKind === 'quick' ? <QuickAsk /> : windowKind === 'bubble' ? <Bubble /> : <App />;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{root}</React.StrictMode>,
);
