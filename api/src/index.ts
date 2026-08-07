import express from "express";
import http from "node:http";
import cors from "cors";
import { Server } from "socket.io";
import { config } from "./config.js";
import { verifyToken } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { problemsRouter } from "./routes/problems.js";
import { contestsRouter } from "./routes/contests.js";
import { submissionsRouter } from "./routes/submissions.js";
import { adminRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";
import { quizRouter } from "./routes/quiz.js";
import { commentsRouter } from "./routes/comments.js";
import { telemetryRouter } from "./routes/telemetry.js";
import { virtualRouter } from "./routes/virtual.js";
import { profileRouter } from "./routes/profile.js";
import { wireLeaderboardBroadcast, buildLeaderboard } from "./leaderboard/service.js";
import { LANGUAGES } from "./judge/judge0.js";

const app = express();
app.set("trust proxy", 1); // behind Caddy/Nginx: use X-Forwarded-For for rate-limit keys
app.use(cors({ origin: config.webOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/languages", (_req, res) =>
  res.json(Object.entries(LANGUAGES).map(([key, v]) => ({ key, label: v.label })))
);

app.use(publicRouter);
app.use("/auth", authRouter);
app.use("/problems", problemsRouter);
app.use("/contests", contestsRouter);
app.use("/submissions", submissionsRouter);
app.use("/admin", adminRouter);
app.use(quizRouter);
app.use(commentsRouter);
app.use(telemetryRouter);
app.use(virtualRouter);
app.use(profileRouter);

// central error handler — never leak stack traces
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[api]", err);
    res.status(500).json({ error: "internal error" });
  }
);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.webOrigin } });

io.use((socket, next) => {
  // Leaderboard viewing is auth'd in MVP; public read-only URL is Phase 2.
  const token = socket.handshake.auth?.token as string | undefined;
  const user = token ? verifyToken(token) : null;
  if (!user) return next(new Error("unauthorized"));
  next();
});

io.on("connection", (socket) => {
  socket.on("join:contest", async (contestId: string) => {
    socket.join(`contest:${contestId}`);
    const payload = await buildLeaderboard(contestId);
    if (payload) socket.emit("leaderboard", payload);
  });
  socket.on("leave:contest", (contestId: string) => {
    socket.leave(`contest:${contestId}`);
  });
});

wireLeaderboardBroadcast(io);

server.listen(config.port, () => {
  console.log(`[api] listening on :${config.port}`);
});
