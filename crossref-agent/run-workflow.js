import { registerApiProvider, dispatch } from '@flue/runtime';
import docsWriterAgent from './dist/agents/docs-writer.js';
import { run } from './dist/workflows/write-data-type-ref.js';

// Register Anthropic API provider
registerApiProvider({
  name: 'anthropic',
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

// Create init function that returns a harness with session method
const init = async (agent, config) => {
  console.log(`[init] Initializing agent: ${config.name}`);

  return {
    session: async () => {
      return {
        prompt: async (message) => {
          console.log(`\n[agent:prompt] Sending prompt (${message.length} chars)...`);
          try {
            const result = await dispatch(agent, {
              type: 'message',
              content: message
            });
            console.log(`[agent:prompt] Received response`);
            return result;
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
