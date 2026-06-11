import { createAgent, registerApiProvider } from '@flue/runtime';
import { run as workflowRun } from './dist/workflows/write-data-type-ref.js';
import fs from 'fs';

// Register Anthropic provider
registerApiProvider({
  name: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || 'sk-test'
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

// Create a mock init function that works with the workflow
async function mockInit(agent, config) {
  console.log(`[mockInit] Initializing agent: ${config.name}`);
  
  // Create a mock session with send method
  const session = {
    send: async (message) => {
      console.log(`\n[Agent] Received prompt (${message.length} chars)`);
      console.log(`---`);
      // For now, just return a mock result
      return 'Mock response from agent';
    }
  };
  
  return { session: () => Promise.resolve(session) };
}

try {
  const result = await workflowRun({ 
    init: mockInit, 
    payload 
  });
  
  console.log('\n=== WORKFLOW COMPLETED ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
} catch (err) {
  console.error('\nERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
}
