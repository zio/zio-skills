export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * 0.8 + (outputTokens / 1_000_000) * 4.0;
}
