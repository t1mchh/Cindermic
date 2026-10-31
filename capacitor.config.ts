import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'local.cindermic.personal',
  appName: 'Cindermic',
  webDir: 'out',
  ios: { contentInset: 'never', backgroundColor: '#101114' },
  android: {
    backgroundColor: '#101114',
  },
};

export default config;
