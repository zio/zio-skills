import { defineAgent } from '@flue/runtime';
import crossLinkerSkill from '../skills/cross-linker/SKILL.md' with { type: 'skill' };

export default defineAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  skills: [crossLinkerSkill],
}));
