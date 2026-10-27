import type { CallableOptions } from 'firebase-functions/v2/https';
import { runtimeConfig } from '../generatedConfig';
import { runtimeIdentity } from './runtimeIdentity';
import { projectId } from './environment';

const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

const allowedOrigins: (string | RegExp)[] = [
  `https://${projectId}.web.app`,
  `https://${projectId}.firebaseapp.com`,
  new RegExp(`^https://${projectId}--[a-z0-9-]+\\.web\\.app$`),
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  'app://admin-desktop',  
];

export const callableOptions: CallableOptions = {
  region: runtimeConfig.region,
  serviceAccount: runtimeIdentity.data,
  enforceAppCheck: !isEmulator, // hard-enforced in prod, relaxed for local/CI
  cors: allowedOrigins,
};

export const identityCallableOptions: CallableOptions = {
  ...callableOptions,
  serviceAccount: runtimeIdentity.identity,
};

export const mediaCallableOptions: CallableOptions = {
  ...callableOptions,
  serviceAccount: runtimeIdentity.media,
};
