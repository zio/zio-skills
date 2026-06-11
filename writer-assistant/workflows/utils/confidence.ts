import type { Confidence } from '../../lib/schemas.js';

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function meetsThreshold(c: Confidence, threshold: Confidence): boolean {
  return CONFIDENCE_ORDER[c] >= CONFIDENCE_ORDER[threshold];
}
