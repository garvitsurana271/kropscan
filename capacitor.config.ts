import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kropscan.hackdays',
  appName: 'KropScan NER',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Enable mixed content for ONNX model loading
    allowMixedContent: true
  },
  android: {
    // Allow file access for ONNX model
    allowMixedContent: true,
    captureInput: true,
    webContainersEnabled: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0F1A0F',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0F1A0F',
      overlaysWebView: false
    }
  }
};

export default config;
