import type { Check } from '../check.ts';
import { style4 } from './style-4.ts';
import { style5 } from './style-5.ts';
import { style10 } from './style-10.ts';
import { style11 } from './style-11.ts';
import { style12 } from './style-12.ts';
import { style13 } from './style-13.ts';
import { style14 } from './style-14.ts';
import { style15 } from './style-15.ts';
import { style18 } from './style-18.ts';
import { style21Form } from './style-21-form.ts';
import { style22 } from './style-22.ts';
import { style23 } from './style-23.ts';
import { style25 } from './style-25.ts';
import { style27 } from './style-27.ts';
import { style28 } from './style-28.ts';

/**
 * Every mechanical style check, in the order `applyFixes` runs their repairs.
 *
 * Order matters only among the fixers, and only in one direction: style-5 joins hard-wrapped
 * paragraphs before style-21-form closes bullet gaps, so a paragraph is never joined across a list
 * boundary that the other fix was about to change. The rest are independent.
 *
 * Adding a rule is one import and one entry. Removing a misbehaving one is deleting a single line —
 * the escape hatch that makes a bad grader cheap to neutralize without a revert.
 */
export const CODE_CHECKS: Check[] = [
  style4,
  style5,
  style10,
  style11,
  style12,
  style13,
  style14,
  style15,
  style18,
  style21Form,
  style22,
  style23,
  style25,
  style27,
  style28,
];

/** The subset that can repair itself. Applied by the write phase, never by review. */
export const FIXABLE: Check[] = CODE_CHECKS.filter((check) => check.fix !== undefined);
