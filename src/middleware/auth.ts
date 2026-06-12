import type { NextFunction, Request, Response } from "express";
import type { Env } from "../config/env.js";
import { verifyToken } from "../utils/jwt.js";
import { AppError } from "./errorHandler.js";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export function createAuthMiddleware(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new AppError(401, "未提供有效的认证令牌"));
      return;
    }

    const token = header.slice(7);
    try {
      const payload = verifyToken(env, token);
      req.userId = payload.userId;
      next();
    } catch {
      next(new AppError(401, "认证令牌无效或已过期"));
    }
  };
}
