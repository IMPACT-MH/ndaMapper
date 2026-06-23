// Fields present in every NDA structure via ndar_subject01.
// Not domain-specific, so excluded from PubMed search term extraction
// and cross-instrument harmonization.
export const NDAR_SUBJECT01_FIELDS = new Set([
  "subjectkey", "src_subject_id", "interview_age", "interview_date", "sex",
]);
