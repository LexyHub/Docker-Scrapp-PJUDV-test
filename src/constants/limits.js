import pLimit from "p-limit";

export const CASE_EXTRACTION_LIMIT = pLimit(10);
