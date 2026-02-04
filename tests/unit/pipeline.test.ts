import { describe, it, expect } from 'vitest';
import {
  PHASE_ORDER,
  TRANSITIONS,
  getValidTransitions,
  isValidTransition,
  findTransitionByTrigger,
  phaseIndex,
} from '@/lib/orchestration/pipeline';

describe('Pipeline State Machine', () => {
  // ── PHASE_ORDER ─────────────────────────────────────────────────────
  describe('PHASE_ORDER', () => {
    it('has exactly 9 entries', () => {
      expect(PHASE_ORDER).toHaveLength(9);
    });

    it('starts with pending and ends with done', () => {
      expect(PHASE_ORDER[0]).toBe('pending');
      expect(PHASE_ORDER[8]).toBe('done');
    });

    it('contains all phases in the correct order', () => {
      expect(PHASE_ORDER).toEqual([
        'pending',
        'design',
        'coding',
        'testing',
        'code_review',
        'fix_review',
        'final_testing',
        'run_test_plan',
        'done',
      ]);
    });
  });

  // ── phaseIndex ──────────────────────────────────────────────────────
  describe('phaseIndex', () => {
    it('returns 0 for pending', () => {
      expect(phaseIndex('pending')).toBe(0);
    });

    it('returns 1 for design', () => {
      expect(phaseIndex('design')).toBe(1);
    });

    it('returns 2 for coding', () => {
      expect(phaseIndex('coding')).toBe(2);
    });

    it('returns 3 for testing', () => {
      expect(phaseIndex('testing')).toBe(3);
    });

    it('returns 4 for code_review', () => {
      expect(phaseIndex('code_review')).toBe(4);
    });

    it('returns 5 for fix_review', () => {
      expect(phaseIndex('fix_review')).toBe(5);
    });

    it('returns 6 for final_testing', () => {
      expect(phaseIndex('final_testing')).toBe(6);
    });

    it('returns 7 for run_test_plan', () => {
      expect(phaseIndex('run_test_plan')).toBe(7);
    });

    it('returns 8 for done', () => {
      expect(phaseIndex('done')).toBe(8);
    });
  });

  // ── getValidTransitions ─────────────────────────────────────────────
  describe('getValidTransitions', () => {
    it('pending -> [design]', () => {
      expect(getValidTransitions('pending')).toEqual(['design']);
    });

    it('design -> [coding]', () => {
      expect(getValidTransitions('design')).toEqual(['coding']);
    });

    it('coding -> [testing]', () => {
      expect(getValidTransitions('coding')).toEqual(['testing']);
    });

    it('testing -> [code_review, coding] (two paths)', () => {
      const result = getValidTransitions('testing');
      expect(result).toContain('code_review');
      expect(result).toContain('coding');
      expect(result).toHaveLength(2);
    });

    it('code_review -> [final_testing, fix_review, coding] (three paths)', () => {
      const result = getValidTransitions('code_review');
      expect(result).toContain('final_testing');
      expect(result).toContain('fix_review');
      expect(result).toContain('coding');
      expect(result).toHaveLength(3);
    });

    it('run_test_plan -> [done, fix_review] (two paths)', () => {
      const result = getValidTransitions('run_test_plan');
      expect(result).toContain('done');
      expect(result).toContain('fix_review');
      expect(result).toHaveLength(2);
    });

    it('done -> [done] (self-transition)', () => {
      expect(getValidTransitions('done')).toEqual(['done']);
    });
  });

  // ── isValidTransition ───────────────────────────────────────────────
  describe('isValidTransition', () => {
    it('design -> coding is valid', () => {
      expect(isValidTransition('design', 'coding')).toBe(true);
    });

    it('coding -> testing is valid', () => {
      expect(isValidTransition('coding', 'testing')).toBe(true);
    });

    it('testing -> code_review is valid', () => {
      expect(isValidTransition('testing', 'code_review')).toBe(true);
    });

    it('testing -> coding is valid (loop back on failure)', () => {
      expect(isValidTransition('testing', 'coding')).toBe(true);
    });

    it('pending -> done is NOT valid (cannot skip phases)', () => {
      expect(isValidTransition('pending', 'done')).toBe(false);
    });

    it('pending -> coding is NOT valid', () => {
      expect(isValidTransition('pending', 'coding')).toBe(false);
    });

    it('coding -> design is NOT valid (no backward transition)', () => {
      expect(isValidTransition('coding', 'design')).toBe(false);
    });

    it('done -> pending is NOT valid', () => {
      expect(isValidTransition('done', 'pending')).toBe(false);
    });
  });

  // ── findTransitionByTrigger ─────────────────────────────────────────
  describe('findTransitionByTrigger', () => {
    it('finds [TESTING_PASSED] from testing -> code_review', () => {
      const t = findTransitionByTrigger('testing', '[TESTING_PASSED]');
      expect(t).toBeDefined();
      expect(t!.from).toBe('testing');
      expect(t!.to).toBe('code_review');
    });

    it('finds [TESTING_FAILED] from testing -> coding', () => {
      const t = findTransitionByTrigger('testing', '[TESTING_FAILED]');
      expect(t).toBeDefined();
      expect(t!.from).toBe('testing');
      expect(t!.to).toBe('coding');
    });

    it('finds [DESIGN_COMPLETED] from design -> coding', () => {
      const t = findTransitionByTrigger('design', '[DESIGN_COMPLETED]');
      expect(t).toBeDefined();
      expect(t!.to).toBe('coding');
    });

    it('finds [CODING_COMPLETED] from coding -> testing', () => {
      const t = findTransitionByTrigger('coding', '[CODING_COMPLETED]');
      expect(t).toBeDefined();
      expect(t!.to).toBe('testing');
    });

    it('finds [REVIEW_COMPLETED] from code_review -> final_testing', () => {
      const t = findTransitionByTrigger('code_review', '[REVIEW_COMPLETED]');
      expect(t).toBeDefined();
      expect(t!.to).toBe('final_testing');
    });

    it('finds [RUN_TEST_PLAN_PASSED] from run_test_plan -> done', () => {
      const t = findTransitionByTrigger('run_test_plan', '[RUN_TEST_PLAN_PASSED]');
      expect(t).toBeDefined();
      expect(t!.to).toBe('done');
    });

    it('returns undefined for unknown trigger', () => {
      const t = findTransitionByTrigger('testing', '[UNKNOWN]');
      expect(t).toBeUndefined();
    });

    it('returns undefined for trigger in wrong phase', () => {
      const t = findTransitionByTrigger('pending', '[TESTING_PASSED]');
      expect(t).toBeUndefined();
    });
  });

  // ── TRANSITIONS array ───────────────────────────────────────────────
  describe('TRANSITIONS', () => {
    it('has a guard on the pending -> design transition', () => {
      const t = TRANSITIONS.find((tr) => tr.from === 'pending' && tr.to === 'design');
      expect(t).toBeDefined();
      expect(t!.guard).toBeDefined();
    });

    it('pending -> design guard passes when blockers empty', () => {
      const t = TRANSITIONS.find((tr) => tr.from === 'pending' && tr.to === 'design');
      expect(t!.guard!({ blockers: [] })).toBe(true);
    });

    it('pending -> design guard fails when blockers present', () => {
      const t = TRANSITIONS.find((tr) => tr.from === 'pending' && tr.to === 'design');
      expect(t!.guard!({ blockers: ['TASK-2'] })).toBe(false);
    });

    it('pending -> design guard passes when blockers undefined', () => {
      const t = TRANSITIONS.find((tr) => tr.from === 'pending' && tr.to === 'design');
      expect(t!.guard!({})).toBe(true);
    });
  });
});
