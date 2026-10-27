/// <reference types="vite/client" />

interface Window {
  desktop: {
    getVersion: () => Promise<string>;
    signIn: () => Promise<{ customToken: string; appCheckToken: string; expiresAt: number }>;
  };
}
