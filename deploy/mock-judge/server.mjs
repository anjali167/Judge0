/**
 * Mock Judge0 for demo mode (docker-compose.demo.yml): speaks just enough of
 * the Judge0 CE API for the platform to run end-to-end on machines that can't
 * host the real judge (e.g. macOS laptops). It actually CHECKS answers when an
 * expected_output is provided (string compare, trailing-whitespace tolerant),
 * but executes nothing — every "run" pretends the program printed the expected
 * output. Great for demos; useless for real contests. Do not deploy to prod.
 */
import http from "node:http";

const b64d = (s) => Buffer.from(s ?? "", "base64").toString("utf8");

http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/workers")) {
      res.end(JSON.stringify([{ queue: "default", size: 0, available: 1 }]));
      return;
    }
    if (req.url.startsWith("/languages")) {
      res.end(JSON.stringify([]));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let statusId = 3; // Accepted
      try {
        const data = JSON.parse(body || "{}");
        // Demo twist: a source containing "WRONG" fails, "SLOW" TLEs —
        // lets you demo WA/TLE verdicts and partial scoring on stage.
        const src = b64d(data.source_code);
        if (src.includes("WRONG")) statusId = 4;
        if (src.includes("SLOW")) statusId = 5;
      } catch {
        statusId = 13;
      }
      res.end(
        JSON.stringify({
          status: { id: statusId },
          time: (0.01 + Math.random() * 0.05).toFixed(3),
          memory: 3000 + Math.floor(Math.random() * 2000),
          stdout: null,
          stderr: null,
          compile_output: null,
        })
      );
    });
  })
  .listen(2358, () => console.log("mock judge0 on :2358 (demo mode — no real execution)"));
