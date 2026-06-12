import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as userService from "../services/user.service.js";
import { AppError } from "../middleware/errorHandler.js";

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
});

export const userController = {
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.userId === undefined) {
        throw new AppError(401, "未认证");
      }
      const user = await userService.getMe(req.userId);
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.userId === undefined) {
        throw new AppError(401, "未认证");
      }
      const body = updateMeSchema.parse(req.body);
      const user = await userService.updateMe(req.userId, body);
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  },
};
