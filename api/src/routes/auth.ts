import { Router } from "express";
import rateLimit from "express-rate-limit";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, signToken } from "../auth.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await argon2.verify(user.hash, password))) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = signToken({ id: user.id, role: user.role, name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
});

const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

authRouter.post("/register", authLimiter, async (req, res) => {
  const setting = await prisma.instanceSetting.findUnique({ where: { key: "signup_mode" } });
  const mode = (setting?.value as string | undefined) ?? "open";
  if (mode !== "open") {
    return res.status(403).json({ error: "signup is invite/import only on this instance" });
  }
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "email already registered" });

  const hash = await argon2.hash(password);
  const user = await prisma.user.create({ data: { name, email, hash } });
  const token = signToken({ id: user.id, role: user.role, name: user.name });
  res.status(201).json({ token, user: { id: user.id, name: user.name, role: user.role, email } });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      externalId: true,
      group: { select: { id: true, name: true } },
    },
  });
  res.json(user);
});
