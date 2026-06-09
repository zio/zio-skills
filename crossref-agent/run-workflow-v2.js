import { dispatch, registerApiProvider } from '@flue/runtime';
import docsWriterAgent from './dist/agents/docs-writer.js';

// Register Anthropic provider
registerApiProvider({
  name: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
});

const payload = {
  projectRoot: "/home/milad/sources/scala/zio-2.x-new",
  outputPath: "docs/reference/resource/cached.md",
  dataTypePath: "core/shared/src/main/scala/zio/Cached.scala"
};

console.log('[docs-write-data-type-ref] Starting workflow with dispatch...\n');

try {
  const result = await dispatch(docsWriterAgent, {
    type: 'message',
    content: `Please document the Cached type from ${payload.dataTypePath} and save documentation to ${payload.outputPath}. Project root is ${payload.projectRoot}.`
  });
  
  console.log('\n=== DISPATCH RESULT ===');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
}
