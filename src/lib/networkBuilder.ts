import "server-only";
import type { DataStructure, NetworkGraph, NetworkNode, NetworkEdge } from "@/types";

const NDAR_SUBJECT01_FIELDS = new Set([
  "subjectkey", "src_subject_id", "interview_age", "interview_date", "sex",
]);

/**
 * Build a NetworkGraph from multiple DataStructure objects.
 *
 * Nodes:
 *   - One "instrument" node per structure
 *   - One "datatype" node per unique data type
 *   - One "site" node per unique site (submittedByProjects)
 *
 * Edges:
 *   - instrument → datatype (has_type)
 *   - instrument → site (collected_at)
 *   - instrument → instrument (shares N elements) — only if sharedElements ≥ 1
 */
export function buildNetworkGraph(structures: DataStructure[]): NetworkGraph {
  const nodes: NetworkNode[] = [];
  const edges: NetworkEdge[] = [];
  const nodeIds = new Set<string>();

  function addNode(node: NetworkNode) {
    if (!nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  }

  // Add instrument nodes + site nodes + datatype nodes + edges
  for (const structure of structures) {
    const instrId = `instrument:${structure.shortName}`;
    addNode({
      id: instrId,
      label: structure.shortName,
      type: "instrument",
    });

    // Site edges
    for (const site of structure.submittedByProjects ?? []) {
      const siteId = `site:${site}`;
      addNode({ id: siteId, label: site, type: "site" });
      edges.push({
        source: instrId,
        target: siteId,
        label: "collected_at",
        weight: 1,
      });
    }

    // Data type edges
    const dataTypes = structure.dataTypes ?? (structure.dataType ? [structure.dataType] : []);
    for (const dt of dataTypes) {
      const dtId = `datatype:${dt}`;
      addNode({ id: dtId, label: dt, type: "datatype" });
      edges.push({
        source: instrId,
        target: dtId,
        label: "has_type",
        weight: 1,
      });
    }
  }

  // Instrument–instrument edges based on shared element count
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
        edges.push({
          source: `instrument:${structures[i].shortName}`,
          target: `instrument:${structures[j].shortName}`,
          label: `${shared.length} shared elements`,
          weight: shared.length,
          sharedElementNames: shared,
        });
      }
    }
  }

  return { nodes, edges };
}
