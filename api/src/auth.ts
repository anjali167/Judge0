import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export interface AuthUser {
  id: string;
  role: "PARTICIPANT" | "ORGANIZER" | "SUPER_ADMIN";
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, {
    expiresIn: config.jwtExpiry as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload & AuthUser;
    return { id: payload.id, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const user = token ? verifyToken(token) : null;
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.user = user;
  next();
}

const ROLE_RANK = { PARTICIPANT: 0, ORGANIZER: 1, SUPER_ADMIN: 2 } as const;

export function requireRole(minRole: keyof typeof ROLE_RANK) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "unauthorized" });
    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}
