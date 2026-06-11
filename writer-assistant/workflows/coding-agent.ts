import codingAgent from '../agents/coding-agent.js';

export async function run(context: any) {
  const payload = context?.payload as { pwd?: string; prompt?: string };
  const pwd = payload?.pwd as string;
  const prompt = payload?.prompt as string;

  if (!pwd || !prompt) {
    return {
      status: 'error',
      message: 'Missing required parameters: pwd and prompt',
    };
  }

  console.log(`\n📁 Working directory: ${pwd}`);
  console.log(`📝 Task: ${prompt}\n`);

  const harness = await context.initializeCreatedAgent(codingAgent);
  const session = await harness.session();

  // Subscribe to all events and log tool calls/results
  context.subscribeEvent((event: any) => {
    if (event.type === 'tool_start' || event.type === 'tool_execution_start') {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🔧 TOOL CALL: ${event.toolName}`);
      console.log(`${'='.repeat(80)}`);
      if (event.args) {
        console.log(`Args:`, JSON.stringify(event.args, null, 2));
      }
    }
    if (event.type === 'tool_done') {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`✅ ${event.toolName} OUTPUT:`);
      console.log(`${'─'.repeat(80)}`);
      const output = event.output || event.result || event.data || '';
      console.log(output);
    }
    if (event.type === 'tool_error') {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`❌ ${event.toolName} ERROR:`);
      console.log(`${'─'.repeat(80)}`);
      console.log(event.error || event.message || 'Unknown error');
    }
  });

  return await session.prompt(
    `You are working in the project directory: ${pwd}\n\nWhen using bash, execute commands in the project directory: ${pwd}\n\nTask: ${prompt}`
  );
}
