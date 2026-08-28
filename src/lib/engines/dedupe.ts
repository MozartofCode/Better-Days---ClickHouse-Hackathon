// Pure function. Fuzzy household de-duplication via Dice coefficient on bigrams.

import type { HouseholdRecord } from "../schema";

export interface DupeCluster {
  score: number;
  members: HouseholdRecord[];
}

const STREET_SUFFIXES = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court)\b\.?/gi;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(STREET_SUFFIXES, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): string[] {
  const clean = s.replace(/\s+/g, "");
  const grams: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) grams.push(clean.slice(i, i + 2));
  return grams;
}

function diceCoefficient(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.length === 0 || gb.length === 0) return a === b ? 1 : 0;
  const bag = new Map<string, number>();
  for (const g of ga) bag.set(g, (bag.get(g) ?? 0) + 1);
  let matches = 0;
  for (const g of gb) {
    const count = bag.get(g) ?? 0;
    if (count > 0) {
      matches++;
      bag.set(g, count - 1);
    }
  }
  return (2 * matches) / (ga.length + gb.length);
}

function similarity(a: HouseholdRecord, b: HouseholdRecord): number {
  const nameSim = diceCoefficient(normalize(a.nameRaw), normalize(b.nameRaw));
  const addrSim = diceCoefficient(normalize(a.addressRaw), normalize(b.addressRaw));
  return 0.6 * nameSim + 0.4 * addrSim;
}

export function findDuplicates(households: HouseholdRecord[], threshold = 0.85): DupeCluster[] {
  const n = households.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const pairScore = new Map<string, number>();

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const score = similarity(households[i], households[j]);
      if (score >= threshold) {
        union(i, j);
        pairScore.set(`${i}-${j}`, score);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  const clusters: DupeCluster[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    let best = 0;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const key1 = `${Math.min(idxs[a], idxs[b])}-${Math.max(idxs[a], idxs[b])}`;
        best = Math.max(best, pairScore.get(key1) ?? 0);
      }
    }
    clusters.push({ score: Math.round(best * 100) / 100, members: idxs.map((i) => households[i]) });
  }

  return clusters.sort((a, b) => b.score - a.score);
}

export function unduplicatedCount(households: HouseholdRecord[], clusters: DupeCluster[]): number {
  const extra = clusters.reduce((sum, c) => sum + (c.members.length - 1), 0);
  return households.length - extra;
}
