import { NextRequest, NextResponse } from "next/server";
import { generateMockDataset, generateSubjectPool } from "@/lib/mockDataGenerator";
import {
  createErrorResponse,
  createOptionsResponse,
  CORS_HEADERS,
} from "@/lib/api-client";
import type { DataElement, DataStructure, MockDataset } from "@/types";

const ROWS_PER_STRUCTURE = 50;

async function fetchDataElements(shortName: string): Promise<DataElement[]> {
  try {
    const response = await fetch(
      `https://nda.nih.gov/api/datadictionary/datastructure/${shortName}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return [];
    const data = await response.json() as { dataElements?: DataElement[] };
    return data.dataElements ?? [];
  } catch {
    return [];
  }
}

interface MockRequest {
  selectedStructures: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: MockRequest;
  try {
    body = await request.json() as MockRequest;
  } catch {
    return createErrorResponse("Invalid JSON request body", 400);
  }

  const { selectedStructures } = body;
  if (!selectedStructures || !Array.isArray(selectedStructures) || selectedStructures.length === 0) {
    return createErrorResponse("selectedStructures (array of shortNames) is required", 400);
  }

  // Generate a shared subject pool so all datasets have the same subjects
  const subjectPool = generateSubjectPool(ROWS_PER_STRUCTURE);

  const datasets = await Promise.all(
    selectedStructures.map(async (shortName): Promise<MockDataset | null> => {
      const dataElements = await fetchDataElements(shortName);
      if (dataElements.length === 0) return null;

      const structure: DataStructure = {
        shortName,
        title: shortName,
        dataElements,
      };

      return generateMockDataset(structure, ROWS_PER_STRUCTURE, subjectPool);
    })
  );

  const validDatasets = datasets.filter((d): d is MockDataset => d !== null);

  return NextResponse.json(validDatasets, { headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return createOptionsResponse();
}
