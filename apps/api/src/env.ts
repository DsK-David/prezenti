import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@prezenti.app',
  },
};
