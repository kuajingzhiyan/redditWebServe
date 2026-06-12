import type { CorsOptions } from "cors";
import type { Env } from "./env.js";

/** roxy-home-next 浏览器请求会携带的自定义头 */
const ALLOWED_HEADERS = ["Content-Type", "Authorization", "token", "language", "source"];

export function createCorsOptions(env: Env): CorsOptions {
  const allowedOrigins = env.CORS_ORIGINS;

  return {
    origin(origin, callback) {
      // 无 Origin：同源请求、curl、服务端调用
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin ${origin} is not allowed`));
    },
    credentials: true,
    allowedHeaders: ALLOWED_HEADERS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  };
}
