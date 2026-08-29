import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.customgpt.kotha',
  appName: 'Kotha',
  webDir: 'dist',
  android: {
    // Backend is https (cloud), but allow mixed content as a safety net for LAN testing.
    allowMixedContent: true,
  },
};

export default config;
