import * as v from 'valibot';

export const SectionType = v.picklist(['reference', 'guide', 'tutorial', 'overview', 'other']);
export type SectionType = v.InferOutput<typeof SectionType>;

export const PageIndexEntry = v.object({
  id: v.string(),
  title: v.string(),
  path: v.string(),
  absPath: v.string(),
  description: v.optional(v.string()),
  keywords: v.optional(v.array(v.string())),
  contextualTitle: v.optional(v.string()),
  existingLinkCount: v.number(),
  adjacentPages: v.optional(v.array(v.string()), []),
});
export type PageIndexEntry = v.InferOutput<typeof PageIndexEntry>;

export const PageIndexEntryMechanical = v.object({
  id: v.string(),
  title: v.string(),
  path: v.string(),
  absPath: v.string(),
  description: v.optional(v.string()),
  keywords: v.optional(v.array(v.string())),
  contextualTitle: v.optional(v.string()),
  existingLinkCount: v.number(),
  // Issue #1 fix: Include adjacentPages in persisted index
  adjacentPages: v.optional(v.array(v.string()), []),
});
export type PageIndexEntryMechanical = v.InferOutput<typeof PageIndexEntryMechanical>;

export const Confidence = v.picklist(['low', 'medium', 'high']);
export type Confidence = v.InferOutput<typeof Confidence>;

export const LinkSuggestion = v.object({
  sourceId: v.string(),
  targetId: v.string(),
  targetTitle: v.string(),
  targetRelativePath: v.string(),
  anchorText: v.string(),
  description: v.optional(v.string()),
  type: v.picklist(['inline', 'see_also']),
  confidence: Confidence,
  reasoning: v.string(),
  status: v.picklist(['pending', 'applied', 'skipped']),
});
export type LinkSuggestion = v.InferOutput<typeof LinkSuggestion>;

export const SectionClassificationOutput = v.array(
  v.object({ id: v.string(), sectionType: SectionType })
);
export type SectionClassificationOutput = v.InferOutput<typeof SectionClassificationOutput>;

export const PageAnalysisOutput = v.object({
  suggestions: v.array(v.object({
    targetId: v.string(),
    targetTitle: v.string(),
    anchorText: v.string(),
    description: v.optional(v.string()),
    type: v.picklist(['inline', 'see_also']),
    confidence: Confidence,
    reasoning: v.string(),
  })),
});
export type PageAnalysisOutput = v.InferOutput<typeof PageAnalysisOutput>;

export const CrossrefState = v.object({
  indexBuiltAt: v.string(),
  docsDir: v.string(),
  index: v.array(PageIndexEntry),
  processed: v.array(v.string()),
  suggestions: v.array(LinkSuggestion),
  tokens: v.object({
    inputTotal: v.number(),
    outputTotal: v.number(),
    runningCost: v.number(),
  }),
  // Issue #3 fix: Include sectionTypeMap in schema to avoid unsafe 'as any' cast
  sectionTypeMap: v.optional(v.record(v.string(), SectionType), {}),
});
export type CrossrefState = v.InferOutput<typeof CrossrefState>;

export const CrossrefConfig = v.object({
  excludePatterns: v.optional(v.array(v.string()), []),
  maxLinksPerPage: v.optional(v.number(), 10),
  maxSeeAlsoSuggestion: v.optional(v.number(), 5),
  confidenceThreshold: v.optional(Confidence, 'high'),
  clearSuggestionsBeforeRun: v.optional(v.boolean(), false),
});
export type CrossrefConfig = v.InferOutput<typeof CrossrefConfig>;

export const PageIndex = v.object({
  indexBuiltAt: v.string(),
  docsDir: v.string(),
  index: v.array(PageIndexEntryMechanical),
});
export type PageIndex = v.InferOutput<typeof PageIndex>;

export const SuggestionsState = v.object({
  processed: v.array(v.string()),
  suggestions: v.array(LinkSuggestion),
  sectionType: v.record(v.string(), SectionType),
  tokens: v.object({
    inputTotal: v.number(),
    outputTotal: v.number(),
    runningCost: v.number(),
  }),
});
export type SuggestionsState = v.InferOutput<typeof SuggestionsState>;

// Metadata Extractor Input/Output
export const MetadataExtractorInput = v.object({
  pageId: v.string(),
  pageTitle: v.string(),
  pageContent: v.string(),
  existingDescription: v.optional(v.string()),
  existingKeywords: v.optional(v.array(v.string())),
});
export type MetadataExtractorInput = v.InferOutput<typeof MetadataExtractorInput>;

export const MetadataExtractorOutput = v.object({
  description: v.string(),
  keywords: v.array(v.string()),
  sectionType: SectionType,
});
export type MetadataExtractorOutput = v.InferOutput<typeof MetadataExtractorOutput>;
