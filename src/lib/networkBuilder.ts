import "server-only";
import type { DataStructure, NetworkGraph, NetworkNode, NetworkEdge } from "@/types";

const NDAR_SUBJECT01_FIELDS = new Set([
  "subjectkey", "src_subject_id", "interview_age", "interview_date", "sex",
]);

export function buildNetworkGraph(structures: DataStructure[]): NetworkGraph {
  const nodes: NetworkNode[] = [];
  const edges: NetworkEdge[] = [];

  for (const structure of structures) {
    const dataTypes = structure.dataTypes ?? (structure.dataType ? [structure.dataType] : []);
    nodes.push({
      id: `instrument:${structure.shortName}`,
      label: structure.shortName,
      type: "instrument",
      dataType: dataTypes[0],
      sites: structure.submittedByProjects ?? [],
    });
  }

  for (let i = 0; i < structures.length; i++) {
    for (let j = i + 1; j < structures.length; j++) {
      const aElements = new Set(
        (structures[i].dataElements ?? [])
          .map((e) => e.name.toLowerCase())
          .filter((n) => !NDAR_SUBJECT01_FIELDS.has(n))
      );
      const bElements = (structures[j].dataElements ?? [])
        .map((e) => e.name.toLowerCase())
        .filter((n) => !NDAR_SUBJECT01_FIELDS.has(n));
      const shared = bElements.filter((e) => aElements.has(e));
      if (shared.length > 0) {
        const union = aElements.size + bElements.length - shared.length;
        const jaccard = union > 0 ? shared.length / union : 0;
        edges.push({
          source: `instrument:${structures[i].shortName}`,
          target: `instrument:${structures[j].shortName}`,
          label: `${Math.round(jaccard * 100)}% overlap (${shared.length})`,
          weight: shared.length,
          jaccardSimilarity: jaccard,
          sharedElementNames: shared,
        });
      }
    }
  }

  return { nodes, edges };
}
