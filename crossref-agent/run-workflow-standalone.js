import 'dotenv/config.js';
import Anthropic from '@anthropic-ai/sdk';
import { run } from './dist/workflows/docs-write-data-type-ref.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const payload = {
  projectRoot: "/home/milad/sources/scala/zio-2.x-new",
  outputPath: "docs/reference/resource/cached.md",
  dataTypePath: "core/shared/src/main/scala/zio/Cached.scala"
};

console.log('[docs-write-data-type-ref] Starting workflow...\n');
console.log('Parameters:');
console.log(`  projectRoot: ${payload.projectRoot}`);
console.log(`  outputPath: ${payload.outputPath}`);
console.log(`  dataTypePath: ${payload.dataTypePath}\n`);

// Create init function that uses Anthropic SDK directly
const init = async (agent, config) => {
  console.log(`[init] Initializing agent: ${config.name}`);

  // Keep conversation history for multi-turn interaction
  const conversationHistory = [];

  return {
    session: async () => {
      return {
        prompt: async (message) => {
          console.log(`\n[agent:prompt] Sending prompt (${message.length} chars)...`);
          try {
            conversationHistory.push({
              role: 'user',
              content: message
            });

            const response = await client.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 4096,
              system: `You are an expert technical writer specializing in ZIO library documentation.

Your responsibilities:
1. Write comprehensive, accurate reference documentation for ZIO data types
2. Research type implementations, tests, and usage patterns
3. Create well-structured markdown with proper mdoc code blocks
4. Verify all code examples compile without errors
5. Ensure method coverage is complete and accurate
6. Integrate documentation into the docs site structure

Workflow:
1. Research phase — locate source, tests, examples, and understand the complete API
2. Writing phase — produce documentation following ZIO conventions and the section structure
3. Verification phase — run mdoc, check method coverage, fix compilation errors
4. Integration phase — update sidebars, indexes, and cross-references

Focus on accuracy and completeness. All code examples must be verified to compile.
Use the docs-data-type-ref skill for detailed writing guidance and conventions.`,
              messages: conversationHistory
            });

            const assistantMessage = response.content[0].type === 'text' ? response.content[0].text : '';
            conversationHistory.push({
              role: 'assistant',
              content: assistantMessage
            });

            console.log(`[agent:prompt] Received response (${assistantMessage.length} chars)`);
            return assistantMessage;
          } catch (err) {
            console.error(`[agent:prompt] Error: ${err.message}`);
            throw err;
          }
        }
      };
    }
  };
};

run({ init, payload }).then(result => {
  console.log('\n=== WORKFLOW RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}).catch(err => {
  console.error('ERROR:', err);
  console.error(err.stack);
  process.exit(1);
});
