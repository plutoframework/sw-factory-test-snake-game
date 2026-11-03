import { resolveFeatures } from './features.mjs';

const profile = new URLSearchParams(window.location.search).get('features');
const requestedFeatures = resolveFeatures(profile ?? undefined);

// Only completed capabilities may become available, even under `all`.
const availableFeatures = resolveFeatures({ ...requestedFeatures,
  challenges: requestedFeatures.gameplay && requestedFeatures.challenges,
  replay: requestedFeatures.gameplay && requestedFeatures.replay });
let progress;
if (availableFeatures.savedProgress) {
  const { createProgress } = await import('./storage.mjs');
  progress = createProgress({ enabled: true });
}
if (availableFeatures.gameplay) {
  const { mountGameplay } = await import('./gameplay.mjs');
  await mountGameplay({ progress, challenges: availableFeatures.challenges, replay: availableFeatures.replay });
}
document.documentElement.dataset.features = JSON.stringify(requestedFeatures);
document.documentElement.dataset.availableFeatures = JSON.stringify(availableFeatures);
document.documentElement.dataset.ready = 'true';
