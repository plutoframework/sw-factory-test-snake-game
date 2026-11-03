import { resolveFeatures } from './features.mjs';

const profile = new URLSearchParams(window.location.search).get('features');
const requestedFeatures = resolveFeatures(profile ?? undefined);

// Requests are not readiness: no future module exists in this increment.
// Later increments must wire only independently completed capabilities here.
const availableFeatures = resolveFeatures();
document.documentElement.dataset.features = JSON.stringify(requestedFeatures);
document.documentElement.dataset.availableFeatures = JSON.stringify(availableFeatures);
document.documentElement.dataset.ready = 'true';
