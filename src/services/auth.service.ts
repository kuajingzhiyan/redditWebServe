import type { Env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { signToken } from "../utils/jwt.js";
import { GoogleJwksUnavailableError, verifyGoogleIdToken } from "../utils/google.js";
import { comparePassword, hashPassword } from "../utils/password.js";

const userSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SafeUser {
  id: number;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSafeUser(user: {
  id: number;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function register(
  env: Env,
  input: RegisterInput,
): Promise<{ token: string; user: SafeUser }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "该邮箱已被注册");
  }

  if (name) {
    const existingByName = await prisma.user.findFirst({ where: { name } });
    if (existingByName) {
      throw new AppError(409, "该姓名已被使用");
    }
  }

  const hashed = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      name,
    },
    select: userSelect,
  });

  const token = signToken(env, { userId: user.id });
  return { token, user: toSafeUser(user) };
}

export async function loginWithGoogle(
  env: Env,
  credential: string,
): Promise<{ token: string; user: SafeUser }> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(503, "谷歌登录暂未配置");
  }

  let profile: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    profile = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
  } catch (error) {
    if (error instanceof GoogleJwksUnavailableError) {
      throw new AppError(
        503,
        "无法获取 Google 公钥，请运行 pnpm google:fetch-jwks 或配置 HTTPS_PROXY",
      );
    }
    console.error("[auth] Google token verify failed:", error);
    throw new AppError(401, "无效的谷歌登录凭证");
  }

  if (!profile.emailVerified) {
    throw new AppError(401, "谷歌邮箱未验证，无法登录");
  }

  const existingByGoogle = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
  });
  if (existingByGoogle) {
    const token = signToken(env, { userId: existingByGoogle.id });
    return { token, user: toSafeUser(existingByGoogle) };
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email: profile.email },
  });
  if (existingByEmail) {
    if (existingByEmail.googleId && existingByEmail.googleId !== profile.googleId) {
      throw new AppError(409, "该邮箱已绑定其他谷歌账户");
    }

    const user = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        googleId: profile.googleId,
        name: existingByEmail.name ?? profile.name,
      },
      select: userSelect,
    });

    const token = signToken(env, { userId: user.id });
    return { token, user: toSafeUser(user) };
  }

  const user = await prisma.user.create({
    data: {
      email: profile.email,
      googleId: profile.googleId,
      name: profile.name,
    },
    select: userSelect,
  });

  const token = signToken(env, { userId: user.id });
  return { token, user: toSafeUser(user) };
}

export async function login(
  env: Env,
  input: LoginInput,
): Promise<{ token: string; user: SafeUser }> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, "邮箱或密码错误");
  }

  if (!user.password) {
    throw new AppError(401, "该账户请使用谷歌登录");
  }

  const valid = await comparePassword(input.password, user.password);
  if (!valid) {
    throw new AppError(401, "邮箱或密码错误");
  }

  const token = signToken(env, { userId: user.id });
  return {
    token,
    user: toSafeUser(user),
  };
}
