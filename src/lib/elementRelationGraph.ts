import type {
  ConstructGroup,
  ElementRelationGraph,
  ElementRelationNode,
  ElementRelationEdge,
  SharedConstruct,
} from "@/types";

const CONF_RANK: Record<string, number> = { direct: 0, partial: 1, proxy: 2 };
const CONF_BY_RANK = ["direct", "partial", "proxy"] as const;

export function buildElementRelationGraph(
  structures: { shortName: string }[],
  constructs: ConstructGroup[]
): ElementRelationGraph {
  const constructCounts = new Map<string, number>();
  for (const c of constructs) {
    for (const m of c.mappings) {
      constructCounts.set(m.shortName, (constructCounts.get(m.shortName) ?? 0) + 1);
    }
  }

  const nodes: ElementRelationNode[] = structures.map((s) => ({
    id: s.shortName,
    label: s.shortName,
    constructCount: constructCounts.get(s.shortName) ?? 0,
  }));

  const edges: ElementRelationEdge[] = [];
  for (let i = 0; i < structures.length; i++) {
    for (let j = i + 1; j < structures.length; j++) {
      const a = structures[i].shortName;
      const b = structures[j].shortName;
      const shared: SharedConstruct[] = [];
      for (const c of constructs) {
        const mA = c.mappings.find((m) => m.shortName === a);
        const mB = c.mappings.find((m) => m.shortName === b);
        if (mA && mB) {
          shared.push({
            constructName: c.constructName,
            domain: c.domain,
            confidenceA: mA.mappingConfidence,
            confidenceB: mB.mappingConfidence,
          });
        }
      }
      if (shared.length === 0) continue;
      const dominantRank = shared.reduce((best, sc) => {
        const rank = Math.min(CONF_RANK[sc.confidenceA] ?? 2, CONF_RANK[sc.confidenceB] ?? 2);
        return rank < best ? rank : best;
      }, 2);
      edges.push({
        source: a,
        target: b,
        sharedConstructs: shared,
        dominantConfidence: CONF_BY_RANK[dominantRank],
      });
    }
  }

  return { nodes, edges };
}
