-- Baseline DDL matching api/prisma/schema.prisma.
-- Canonical path on a deployed instance is `prisma db push` (see runbook);
-- this file exists for environments where the Prisma schema engine is unavailable.

CREATE TYPE "Role" AS ENUM ('PARTICIPANT', 'ORGANIZER', 'SUPER_ADMIN');
CREATE TYPE "TestCaseKind" AS ENUM ('SAMPLE', 'HIDDEN');
CREATE TYPE "ScoringMode" AS ENUM ('PARTIAL', 'BINARY');
CREATE TYPE "Verdict" AS ENUM ('PENDING', 'RUNNING', 'AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'IE');

CREATE TABLE "groups" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT
);

CREATE TABLE "users" (
    "id" TEXT PRIMARY KEY,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTICIPANT',
    "group_id" TEXT REFERENCES "groups"("id"),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "problems" (
    "id" TEXT PRIMARY KEY,
    "slug" TEXT NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "statement_md" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[],
    "time_limit" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "mem_limit" INTEGER NOT NULL DEFAULT 262144,
    "editorial_md" TEXT,
    "editorial_released" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "test_cases" (
    "id" TEXT PRIMARY KEY,
    "problem_id" TEXT NOT NULL REFERENCES "problems"("id") ON DELETE CASCADE,
    "kind" "TestCaseKind" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expected_output" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    UNIQUE ("problem_id", "kind", "ordinal")
);

CREATE TABLE "contests" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "scoring_mode" "ScoringMode" NOT NULL DEFAULT 'PARTIAL',
    "wrong_penalty_min" INTEGER NOT NULL DEFAULT 10,
    "group_scope" TEXT[],
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "contest_problems" (
    "contest_id" TEXT NOT NULL REFERENCES "contests"("id") ON DELETE CASCADE,
    "problem_id" TEXT NOT NULL REFERENCES "problems"("id"),
    "points" INTEGER NOT NULL DEFAULT 100,
    "order" INTEGER NOT NULL DEFAULT 0,
    "problem_version" INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY ("contest_id", "problem_id")
);

CREATE TABLE "submissions" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "users"("id"),
    "problem_id" TEXT NOT NULL REFERENCES "problems"("id"),
    "contest_id" TEXT REFERENCES "contests"("id"),
    "language" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER NOT NULL DEFAULT 0,
    "max_score" INTEGER NOT NULL DEFAULT 0,
    "exec_time_ms" INTEGER,
    "memory_kb" INTEGER,
    "compile_output" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "submissions_user_id_problem_id_idx" ON "submissions"("user_id", "problem_id");
CREATE INDEX "submissions_contest_id_created_at_idx" ON "submissions"("contest_id", "created_at");

CREATE TABLE "submission_results" (
    "submission_id" TEXT NOT NULL REFERENCES "submissions"("id") ON DELETE CASCADE,
    "test_case_id" TEXT NOT NULL REFERENCES "test_cases"("id") ON DELETE CASCADE,
    "verdict" "Verdict" NOT NULL,
    "time_ms" INTEGER,
    "memory_kb" INTEGER,
    PRIMARY KEY ("submission_id", "test_case_id")
);

CREATE TABLE "instance_settings" (
    "key" TEXT PRIMARY KEY,
    "value" JSONB NOT NULL
);

CREATE TABLE "audit_log" (
    "id" TEXT PRIMARY KEY,
    "actor_id" TEXT REFERENCES "users"("id"),
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
