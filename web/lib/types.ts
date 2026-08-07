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
  type: "CODE" | "QUIZ" | "MIXED";
  startsAt: string;
  endsAt: string;
  scoringMode: string;
  wrongPenaltyMin: number;
  freezeMin: number;
  publicToken: string | null;
  hasQuiz: boolean;
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
  frozen: boolean;
  frozenAt: string | null;
  rows: LeaderboardRow[];
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestionView {
  id: string;
  kind: "SINGLE" | "MULTI" | "NUMERIC" | "CODE_OUTPUT";
  promptMd: string;
  codeMd: string | null;
  marks: number;
  negativeMarks: number;
  options: QuizOption[];
}

export interface QuizPaper {
  contestId: string;
  endsAt: string;
  submitted: boolean;
  score?: number;
  maxScore?: number;
  breakdown?: { questionId: string; status: string; earned: number }[];
  questions: QuizQuestionView[];
}

export interface MostImprovedRow {
  userId: string;
  name: string;
  externalId: string | null;
  groupName: string | null;
  delta: number;
  performance: number;
  rank: number;
  contestsCounted: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface CommentView {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string };
}

export interface InstanceInfo {
  name: string;
  signupMode: string;
  modules: { quiz: boolean; mostImproved: boolean; discussion: boolean };
  mostImprovedK: number;
}
