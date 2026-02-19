import "server-only";
import type { DataStructure, NetworkGraph, NetworkNode, NetworkEdge } from "@/types";

/**
 * Build a NetworkGraph from multiple DataStructure objects.
 *
 * Nodes:
 *   - One "instrument" node per structure
 *   - One "element" node per shared data element (appears in ≥2 structures)
 *   - One "site" node per unique site (submittedByProjects)
 *
 * Edges:
 *   - instrument → shared element (contains)
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

  // Count how many structures each element appears in
  const elementCount = new Map<string, number>();
  for (const structure of structures) {
    const seen = new Set<string>();
    for (const element of structure.dataElements ?? []) {
      const key = element.name.toLowerCase();
      if (!seen.has(key)) {
        elementCount.set(key, (elementCount.get(key) ?? 0) + 1);
        seen.add(key);
      }
    }
  }

  // Shared elements: appear in 2+ structures
  const sharedElements = new Set<string>(
    [...elementCount.entries()]
      .filter(([, count]) => count >= 2)
      .map(([name]) => name)
  );

  // Add instrument nodes + site nodes + edges
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

    // Shared element edges
    for (const element of structure.dataElements ?? []) {
      const key = element.name.toLowerCase();
      if (sharedElements.has(key)) {
        const elemId = `element:${key}`;
        addNode({ id: elemId, label: element.name, type: "element" });
        edges.push({
          source: instrId,
          target: elemId,
          label: "contains",
          weight: 1,
        });
      }
    }
  }

  // Instrument–instrument edges based on shared element count
  for (let i = 0; i < structures.length; i++) {
    for (let j = i + 1; j < structures.length; j++) {
      const aElements = new Set(
        (structures[i].dataElements ?? []).map((e) => e.name.toLowerCase())
      );
      const bElements = (structures[j].dataElements ?? []).map((e) =>
        e.name.toLowerCase()
      );
      const shared = bElements.filter((e) => aElements.has(e));
      if (shared.length > 0) {
        edges.push({
          source: `instrument:${structures[i].shortName}`,
          target: `instrument:${structures[j].shortName}`,
          label: `${shared.length} shared elements`,
          weight: shared.length,
        });
      }
    }
  }

  return { nodes, edges };
}
