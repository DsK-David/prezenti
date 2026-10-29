export type Role = 'super_admin' | 'admin' | 'teacher' | 'guardian';
export interface JwtUser { sub: number; role: Role; school_id: number | null }
export interface Device { id: number; school_id: number; location: 'gate' | 'canteen' }

export interface Bindings {
  DB: D1Database;
  JWT_SECRET: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export type AppEnv = { Bindings: Bindings; Variables: { user: JwtUser; device: Device } };
