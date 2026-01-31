import { describe, it, expect } from 'vitest';
import { allocatePortsForTask } from '@/lib/utils/port-allocator';

describe('Port Allocator', () => {
  describe('allocatePortsForTask', () => {
    it('TASK-1 with base 3000, 10 per task gets ports 3010-3019', () => {
      const ports = allocatePortsForTask('TASK-1', 3000, 10);
      expect(ports).toHaveLength(10);
      expect(ports[0]).toBe(3010);
      expect(ports[9]).toBe(3019);
      expect(ports).toEqual([3010, 3011, 3012, 3013, 3014, 3015, 3016, 3017, 3018, 3019]);
    });

    it('TASK-2 gets ports 3020-3029', () => {
      const ports = allocatePortsForTask('TASK-2', 3000, 10);
      expect(ports[0]).toBe(3020);
      expect(ports[9]).toBe(3029);
    });

    it('TASK-10 gets ports 3100-3109', () => {
      const ports = allocatePortsForTask('TASK-10', 3000, 10);
      expect(ports[0]).toBe(3100);
      expect(ports[9]).toBe(3109);
    });

    it('respects custom base port', () => {
      const ports = allocatePortsForTask('TASK-1', 5000, 10);
      expect(ports[0]).toBe(5010);
      expect(ports[9]).toBe(5019);
    });

    it('respects custom ports per task', () => {
      const ports = allocatePortsForTask('TASK-1', 3000, 5);
      expect(ports).toHaveLength(5);
      expect(ports[0]).toBe(3005);
      expect(ports[4]).toBe(3009);
    });

    it('uses defaults when no base/perTask provided', () => {
      const ports = allocatePortsForTask('TASK-1');
      expect(ports).toHaveLength(10);
      expect(ports[0]).toBe(3010);
    });

    it('handles large task numbers', () => {
      const ports = allocatePortsForTask('TASK-100', 3000, 10);
      expect(ports[0]).toBe(4000);
      expect(ports[9]).toBe(4009);
    });

    it('throws or returns NaN for invalid task ID format', () => {
      // parseInt('', 10) returns NaN, so ports will be NaN-based
      const ports = allocatePortsForTask('INVALID', 3000, 10);
      expect(ports[0]).toBeNaN();
    });

    it('returns deterministic results (same input, same output)', () => {
      const a = allocatePortsForTask('TASK-5', 3000, 10);
      const b = allocatePortsForTask('TASK-5', 3000, 10);
      expect(a).toEqual(b);
    });

    it('adjacent tasks do not overlap', () => {
      const task1Ports = allocatePortsForTask('TASK-1', 3000, 10);
      const task2Ports = allocatePortsForTask('TASK-2', 3000, 10);
      const overlap = task1Ports.filter((p) => task2Ports.includes(p));
      expect(overlap).toHaveLength(0);
    });
  });
});
