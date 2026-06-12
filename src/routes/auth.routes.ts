import { Router } from "express";
import type { Env } from "../config/env.js";
import { createAuthController } from "../controllers/auth.controller.js";

export function createAuthRoutes(env: Env): Router {
  const router = Router();
  const controller = createAuthController(env);

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/google", controller.googleLogin);

  return router;
}
