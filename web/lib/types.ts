export interface User {
  id: string;
  name: string;
  email: string;
  role: "PARTICIPANT" | "ORGANIZER" | "SUPER_ADMIN";
}

export interface ProblemListItem {
  id: string;
  slug: string;
  title: string;
  difficulty: number;
  tags: string[];
  solved: boolean;
  editorialReleased: boolean;
}

export interface SampleCase {
  ordinal: number;
  input: string;
  expectedOutput: string;
}

export interface ProblemDetail {
  id: string;
  slug: string;
  title: string;
  statementMd: string;
  difficulty: number;
  tags: string[];
  timeLimit: number;
  memLimit: number;
  editorial: string | null;
  activeContestId: string | null;
  testCases: SampleCase[];
}

export interface ContestListItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  scoringMode: string;
  _count: { problems: number };
}

export interface ContestDetail {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  scoringMode: string;
  wrongPenaltyMin: number;
  status: "upcoming" | "running" | "ended";
  problems: { id: string; slug: string; title: string; difficulty: number; points: number; order: number }[];
}

export interface CaseResult {
  kind: "SAMPLE" | "HIDDEN";
  ordinal: number;
  verdict: string;
  timeMs: number | null;
}

export interface SubmissionDetail {
  id: string;
  verdict: string;
  score: number;
  maxScore: number;
  execTimeMs: number | null;
  compileOutput: string | null;
  position: number;
  results: CaseResult[];
  createdAt: string;
}

export interface SubmissionListItem {
  id: string;
  language: string;
  verdict: string;
  score: number;
  maxScore: number;
  execTimeMs: number | null;
  createdAt: string;
  problem: { slug: string; title: string };
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  externalId: string | null;
  groupName: string | null;
  rank: number;
  totalScore: number;
  penaltyMin: number;
  problems: Record<
    string,
    { problemId: string; bestScore: number; solved: boolean; attempts: number; bestAtMin: number | null }
  >;
}

export interface LeaderboardPayload {
  contestId: string;
  generatedAt: string;
  rows: LeaderboardRow[];
}
