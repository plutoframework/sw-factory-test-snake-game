import { resolveFeatures } from './features.mjs';

const profile = new URLSearchParams(window.location.search).get('features');
const requestedFeatures = resolveFeatures(profile ?? undefined);

// Only completed capabilities may become available, even under `all`.
const availableFeatures = resolveFeatures({ gameplay: requestedFeatures.gameplay });
if (availableFeatures.gameplay) {
  const { mountGameplay } = await import('./gameplay.mjs');
  mountGameplay();
}
document.documentElement.dataset.features = JSON.stringify(requestedFeatures);
document.documentElement.dataset.availableFeatures = JSON.stringify(availableFeatures);
document.documentElement.dataset.ready = 'true';
