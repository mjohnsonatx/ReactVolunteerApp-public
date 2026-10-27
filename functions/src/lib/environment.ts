import { runtimeConfig } from '../generatedConfig';

// Firebase supplies GCLOUD_PROJECT during both deployment discovery and runtime.
// The fallback keeps existing production tooling and isolated unit tests working.
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
export const projectId: string = process.env.GCLOUD_PROJECT || firebaseConfig.projectId
  || process.env.FIREBASE_PROJECT_ID || 'tillerystreettrail';
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('Invalid Firebase runtime project');

export const siteUrl = process.env.WATERSHED_SITE_URL || `https://${projectId}.web.app`;
const site = new URL(siteUrl);
const previewHost = new RegExp(`^${projectId}--[a-z0-9-]+\\.web\\.app$`);
if (site.protocol !== 'https:' || site.username || site.password || site.port
  || site.pathname !== '/' || site.search || site.hash
  || ![`${projectId}.web.app`, `${projectId}.firebaseapp.com`].includes(site.hostname)
    && !previewHost.test(site.hostname)) {
  throw new Error('Notification links must target this Firebase project');
}

export const desktopAppId = process.env.WATERSHED_WEB_APP_ID
  || (projectId === 'tillerystreettrail' || process.env.FUNCTIONS_EMULATOR === 'true' ? runtimeConfig.desktopAppId : '');
