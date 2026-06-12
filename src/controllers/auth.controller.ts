import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { Env } from "../config/env.js";
import * as authService from "../services/auth.service.js";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(6, "密码至少 6 位"),
  name: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const googleLoginSchema = z.object({
  credential: z.string().min(1),
});

export function createAuthController(env: Env) {
  return {
    async register(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = registerSchema.parse(req.body);
        const result = await authService.register(env, body);
        res.status(201).json({ data: result });
      } catch (err) {
        next(err);
      }
    },

    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = loginSchema.parse(req.body);
        const result = await authService.login(env, body);
        res.json({ data: result });
      } catch (err) {
        next(err);
      }
    },

    async googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = googleLoginSchema.parse(req.body);
        const result = await authService.loginWithGoogle(env, body.credential);
        res.json({ data: result });
      } catch (err) {
        next(err);
      }
    },
  };
}
