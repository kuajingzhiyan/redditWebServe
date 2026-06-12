import jwt from "jsonwebtoken";
import type { Env } from "../config/env.js";

export interface JwtPayload {
  userId: number;
}

export function signToken(env: Env, payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyToken(env: Env, token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
