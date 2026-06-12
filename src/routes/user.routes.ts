import { Router } from "express";
import type { Env } from "../config/env.js";
import { userController } from "../controllers/user.controller.js";
import { createAuthMiddleware } from "../middleware/auth.js";

export function createUserRoutes(env: Env): Router {
  const router = Router();
  const auth = createAuthMiddleware(env);

  router.get("/me", auth, userController.getMe);
  router.patch("/me", auth, userController.updateMe);

  return router;
}
