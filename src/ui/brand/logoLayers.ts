/**
 * The brand mark split into its parts, for the welcome intro. A separate
 * entry (`@/ui/brand/logoLayers`), not re-exported from `@/ui`: three of the
 * layers are small enough for Vite to inline as base64, and through the
 * barrel they rode along in the first-paint shell of every page.
 */
import layerFrame from './layers/frame.png';
import layerBandYellow from './layers/band-yellow.png';
import layerBandOrange from './layers/band-orange.png';
import layerPageLeft from './layers/page-left.png';
import layerPageRight from './layers/page-right.png';
import layerSymbolLeft from './layers/symbol-left.png';
import layerSymbolRight from './layers/symbol-right.png';
import layerCursor from './layers/cursor.png';

/**
 * The same mark split into its parts (the supplied animation layers, cropped
 * and scaled exactly like the mark), in paint order. Stacked, they are the
 * logo; the welcome intro assembles them one at a time.
 */
export const CODECONSIST_LOGO_LAYERS = [
  { id: 'frame', src: layerFrame },
  { id: 'band-yellow', src: layerBandYellow },
  { id: 'band-orange', src: layerBandOrange },
  { id: 'page-left', src: layerPageLeft },
  { id: 'page-right', src: layerPageRight },
  { id: 'symbol-left', src: layerSymbolLeft },
  { id: 'symbol-right', src: layerSymbolRight },
  { id: 'cursor', src: layerCursor }
] as const;

export const DEVLINGO_LOGO_LAYERS = CODECONSIST_LOGO_LAYERS;
