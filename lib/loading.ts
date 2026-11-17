import { Div } from 'ranui/builder';
import { isNativeShell } from './offline-worker-control';

/**
 * Familienbüro Pro (Klaus 17.11.2026): beim Laden dreht sich das Zeichen der App, kein Punktekreis.
 * Die Drehung selbst steht in editor.html (dort ist sie schon vor dem Programmcode zu sehen).
 */
const zeichen = (): HTMLImageElement => {
  const bild = document.createElement('img');
  bild.className = 'fb-dreht';
  bild.alt = '';
  bild.src = isNativeShell() ? './icons/pro/familienbuero-pro-192.png' : './icons/document-192.png';
  return bild;
};

/** Das Zeichen vom Seitenstart entfernen, sobald die App selbst etwas zeigt. */
export const startzeichenWeg = (): void => {
  document.getElementById('fb-start')?.remove();
};

// Full-screen loading overlay. Structure via the ranui builder (ecosystem
// convention), visuals via .loading-mask in styles/base.css (token layer).
export const showLoading = (): { removeLoading: () => void } => {
  startzeichenWeg();
  const mask = Div().class('loading-mask').children(zeichen()).build();
  document.body.appendChild(mask);
  return {
    removeLoading: () => {
      mask.remove();
    },
  };
};
