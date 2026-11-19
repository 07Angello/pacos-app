import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'hn.pacos.staff',
  appName: "Paco's Staff",
  webDir: 'www',
  plugins: {
    PushNotifications: {
      // Con la app abierta los avisos llegan por tiempo real (sonido + aviso en pantalla);
      // las push del sistema se muestran cuando la app está cerrada o en segundo plano.
      presentationOptions: [],
    },
  },
};

export default config;
