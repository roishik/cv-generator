// Barrel for the JD → tailored CV pipeline (M8/M10).
export { tailorToJob } from "./pipeline";
export type { TailorToJobInput, TailorToJobResult, TailorToJobSuccess } from "./pipeline";
export { recommendTemplate, resolveTemplate } from "./template-heuristic";
export type { TemplateHeuristicResult } from "./template-heuristic";
export { tailorCacheKey, jdHash, normalizeJd } from "./cache";
export { computeStructuredDiff } from "./diff";
export type { StructuredDiff, FieldDiff, DiffKind } from "./diff";
export {
  loadKnowledgeBase,
  loadBaselineCvData,
  projectBaselineCvData,
} from "./kb-loader";
export type { LoadedKnowledgeBase } from "./kb-loader";
