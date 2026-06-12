import { prisma } from "../db/prisma.js";
import { AppError } from "../middleware/errorHandler.js";

export interface UpdateMeInput {
  name?: string;
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getMe(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });

  if (!user) {
    throw new AppError(404, "用户不存在");
  }

  return user;
}

export async function updateMe(userId: number, input: UpdateMeInput) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: input.name },
    select: userSelect,
  });

  return user;
}
