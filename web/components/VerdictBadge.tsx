const COLORS: Record<string, string> = {
  AC: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  WA: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  TLE: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  MLE: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  RE: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  CE: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  IE: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  PENDING: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  RUNNING: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900 dark:text-blue-200",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${COLORS[verdict] ?? COLORS.IE}`}>
      {verdict}
    </span>
  );
}
