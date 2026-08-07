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

-- ==== Phase 2 additions ====

CREATE TYPE "ContestType" AS ENUM ('CODE', 'QUIZ', 'MIXED');
CREATE TYPE "QuizKind" AS ENUM ('SINGLE', 'MULTI', 'NUMERIC', 'CODE_OUTPUT');

ALTER TABLE "contests"
    ADD COLUMN "type" "ContestType" NOT NULL DEFAULT 'CODE',
    ADD COLUMN "freeze_min" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "public_token" TEXT UNIQUE,
    ADD COLUMN "ratings_finalized" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "quiz_questions" (
    "id" TEXT PRIMARY KEY,
    "contest_id" TEXT NOT NULL REFERENCES "contests"("id") ON DELETE CASCADE,
    "ordinal" INTEGER NOT NULL,
    "kind" "QuizKind" NOT NULL,
    "prompt_md" TEXT NOT NULL,
    "code_md" TEXT,
    "options" JSONB NOT NULL,
    "answer" JSONB NOT NULL,
    "marks" INTEGER NOT NULL DEFAULT 4,
    "negative_marks" INTEGER NOT NULL DEFAULT 0,
    UNIQUE ("contest_id", "ordinal")
);

CREATE TABLE "quiz_attempts" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "users"("id"),
    "contest_id" TEXT NOT NULL REFERENCES "contests"("id") ON DELETE CASCADE,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "max_score" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("user_id", "contest_id")
);

CREATE TABLE "ratings" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "users"("id"),
    "contest_id" TEXT NOT NULL REFERENCES "contests"("id") ON DELETE CASCADE,
    "rating_before" INTEGER NOT NULL,
    "rating_after" INTEGER NOT NULL,
    "performance" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("user_id", "contest_id")
);

CREATE TABLE "comments" (
    "id" TEXT PRIMARY KEY,
    "problem_id" TEXT NOT NULL REFERENCES "problems"("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "users"("id"),
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "comments_problem_id_created_at_idx" ON "comments"("problem_id", "created_at");

CREATE TABLE "announcements" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==== Phase 3 additions ====

CREATE TYPE "FlagStatus" AS ENUM ('PENDING', 'DISMISSED', 'CONFIRMED');
CREATE TYPE "TelemetryKind" AS ENUM ('TAB_HIDDEN', 'TAB_VISIBLE', 'PASTE');

ALTER TABLE "submissions" ADD COLUMN "virtual" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "plagiarism_flags" (
    "id" TEXT PRIMARY KEY,
    "contest_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "submission_a" TEXT NOT NULL,
    "submission_b" TEXT NOT NULL,
    "user_a" TEXT NOT NULL,
    "user_b" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("contest_id", "problem_id", "submission_a", "submission_b")
);
CREATE INDEX "plagiarism_flags_contest_id_status_idx" ON "plagiarism_flags"("contest_id", "status");

CREATE TABLE "telemetry_events" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "kind" "TelemetryKind" NOT NULL,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "telemetry_events_contest_id_user_id_at_idx" ON "telemetry_events"("contest_id", "user_id", "at");

CREATE TABLE "virtual_participations" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("user_id", "contest_id")
);
