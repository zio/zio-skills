import { createAgent } from '@flue/runtime';
import metadataExtractorSkill from '../skills/metadata-extractor/SKILL.md' with { type: 'skill' };

export default createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  skills: [metadataExtractorSkill],
}));
