/**
 * Deterministic port allocation based on task number.
 * Formula: base_port + (task_number * ports_per_task)
 */
export function allocatePortsForTask(
  taskId: string,
  basePort: number = 3000,
  portsPerTask: number = 10
): number[] {
  const taskNumber = parseInt(taskId.replace('TASK-', ''), 10);
  const startPort = basePort + (taskNumber * portsPerTask);
  return Array.from({ length: portsPerTask }, (_, i) => startPort + i);
}
