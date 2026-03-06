export interface FuzzyMatch {
  entry: string;
  score: number;
  indices: number[];
}

export function fuzzyMatch(pattern: string, target: string): FuzzyMatch | null {
  const p = pattern.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let pi = 0;

  for (let ti = 0; ti < t.length && pi < p.length; ti++) {
    if (t[ti] === p[pi]) {
      indices.push(ti);

      if (ti === 0) score += 5;
      else if (t[ti - 1] === " " || t[ti - 1] === "/" || t[ti - 1] === "-" || t[ti - 1] === "_")
        score += 3;

      if (indices.length > 1 && indices[indices.length - 2] === ti - 1) score += 2;

      pi++;
    } else if (indices.length > 0) {
      score -= 1;
    }
  }

  if (pi < p.length) return null;
  return { entry: target, score, indices };
}

export function fuzzyFilter(pattern: string, entries: string[], limit = 50): FuzzyMatch[] {
  if (!pattern) return entries.slice(0, limit).map((e) => ({ entry: e, score: 0, indices: [] }));

  const matches: FuzzyMatch[] = [];
  for (const entry of entries) {
    const m = fuzzyMatch(pattern, entry);
    if (m) matches.push(m);
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}
