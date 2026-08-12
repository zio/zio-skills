import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

/**
 * Minimal todo task tree for harnessing a session through multi-step work
 * (create tasks up front, then work them one at a time). State is
 * module-level and per-process for the same reason as reviewCallCount in
 * review-page.ts: this repo runs one process per tutorial. The
 * invariants live in code, not prose: only one task in_progress at a time,
 * and a parent cannot complete while a child is open.
 */
interface TodoTask {
  id: number;
  title: string;
  parentId: number | null;
  status: 'pending' | 'in_progress' | 'completed';
}

let tasks: TodoTask[] = [];

export const resetTodos = () => {
  tasks = [];
};

export const allTodosCompleted = () => tasks.length > 0 && tasks.every((t) => t.status === 'completed');

export const openTodos = () => tasks.filter((t) => t.status !== 'completed');

const renderTree = (): string =>
  tasks
    .map((t) => {
      const mark = t.status === 'completed' ? 'x' : t.status === 'in_progress' ? '>' : ' ';
      const indent = t.parentId === null ? '' : '  ';
      return `${indent}- [${mark}] #${t.id} ${t.title}`;
    })
    .join('\n') || '(no tasks)';

export const todoCreate = defineTool({
  name: 'todo_create',
  description: 'Create a task in the todo tree. Pass parentId to nest a subtask under an existing task.',
  input: v.object({
    title: v.pipe(v.string(), v.minLength(1)),
    parentId: v.optional(
      v.nullable(v.pipe(v.number(), v.description('id of an existing task to nest under; omit, null, or 0 for a top-level task'))),
    ),
  }),
  output: v.object({ id: v.number() }),
  async run({ data }) {
    // Models routinely send 0 or omit the field to mean "no parent" — treat all falsy as root.
    const parentId = data.parentId || null;
    if (parentId !== null && !tasks.some((t) => t.id === parentId)) {
      throw new Error(`parentId ${parentId} does not exist — pass null or omit it for a top-level task`);
    }
    const id = tasks.length + 1;
    tasks.push({ id, title: data.title, parentId, status: 'pending' });
    return { output: { id } };
  },
});

export const todoUpdate = defineTool({
  name: 'todo_update',
  description:
    'Set a task status. Only one task may be in_progress at a time; a parent cannot be completed while a child is open. Reopen a task by setting it back to pending.',
  input: v.object({
    id: v.number(),
    status: v.picklist(['pending', 'in_progress', 'completed']),
  }),
  output: v.object({ ok: v.boolean(), error: v.nullable(v.string()), open: v.number() }),
  async run({ data }) {
    const task = tasks.find((t) => t.id === data.id);
    if (!task) return { output: { ok: false, error: `task #${data.id} does not exist`, open: openTodos().length } };
    if (data.status === 'in_progress') {
      const busy = tasks.find((t) => t.status === 'in_progress' && t.id !== data.id && t.parentId === task.parentId);
      if (busy) {
        return {
          output: { ok: false, error: `finish #${busy.id} first — one sibling in_progress at a time`, open: openTodos().length },
        };
      }
    }
    if (data.status === 'completed') {
      const openChild = tasks.find((t) => t.parentId === data.id && t.status !== 'completed');
      if (openChild) {
        return { output: { ok: false, error: `child #${openChild.id} is still open`, open: openTodos().length } };
      }
    }
    task.status = data.status;
    return { output: { ok: true, error: null, open: openTodos().length } };
  },
});

export const todoList = defineTool({
  name: 'todo_list',
  description: 'List the todo tree with statuses ([ ] pending, [>] in_progress, [x] completed).',
  output: v.object({ tree: v.string(), open: v.number() }),
  async run() {
    return { output: { tree: renderTree(), open: openTodos().length } };
  },
});
