import * as v from 'valibot';
import { defineWorkflow } from '@flue/runtime';
import codingAgent from '../agents/coding-agent.js';

export default defineWorkflow({
  agent: codingAgent,
  input: v.looseObject({}),
  run: (async (ctx: any) => {
    const { harness, input } = ctx;
    const { pwd, prompt } = input as { pwd?: string; prompt?: string };

    if (!pwd || !prompt) {
      return {
        status: 'error',
        message: 'Missing required parameters: pwd and prompt',
      };
    }

    console.log(`\n📁 Working directory: ${pwd}`);
    console.log(`📝 Task: ${prompt}\n`);

    const session = await harness.session();

    return await session.prompt(
      `You are working in the project directory: ${pwd}\n\nWhen using bash, execute commands in the project directory: ${pwd}\n\nTask: ${prompt}`
    );
  }) as (ctx: any) => any,
});
