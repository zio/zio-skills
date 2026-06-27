import { defineAgent } from '@flue/runtime';
import metadataExtractorSkill from '../skills/metadata-extractor/SKILL.md' with { type: 'skill' };

export default defineAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  skills: [metadataExtractorSkill],
}));
