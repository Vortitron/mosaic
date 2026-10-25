// Selawik is Microsoft's open-source (OFL) stand-in for Segoe UI. It ships
// inside the card, so nothing is fetched from a font CDN. @font-face has to
// live in the document, not in a shadow root, to apply.
import light from '../fonts/selawik-light.woff2';
import semilight from '../fonts/selawik-semilight.woff2';
import regular from '../fonts/selawik-regular.woff2';
import semibold from '../fonts/selawik-semibold.woff2';

export function installFonts() {
  if (document.getElementById('mosaic-fonts')) return;
  const style = document.createElement('style');
  style.id = 'mosaic-fonts';
  style.textContent = [[light, 300], [semilight, 350], [regular, 400], [semibold, 600]]
    .map(([url, weight]) => `@font-face{font-family:"Mosaic Selawik";src:url(${url}) format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`)
    .join('');
  document.head.append(style);
}
