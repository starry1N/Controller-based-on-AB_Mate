import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.abmate.app',
  appName: 'AB-Mate',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: undefined,
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 1000,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    BackgroundTask: {
      label: 'UPDATE_LOCATION',
    },
  },
};

export default config;
