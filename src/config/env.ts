import "dotenv/config";
import { z } from "zod";

/** 本地开发与 reddit-web / roxy-home-next 常用 Origin */
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://gatetest.roxybrowser.co",
  "https://test.roxybrowser.cn",
  "https://spangrowth.com",
  "https://www.spangrowth.com",
];

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value?.trim()) {
    return DEFAULT_CORS_ORIGINS;
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().int().positive().default(3000),
  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((value) => parseCorsOrigins(value)),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
