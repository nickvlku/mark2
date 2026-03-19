'use client';

import type { Plan } from '@/types';
import { LiveTerminal } from '@/components/shared/LiveTerminal';

interface PlanTerminalViewProps {
  plan: Plan;
}

export function PlanTerminalView({ plan }: PlanTerminalViewProps) {
  return (
    <LiveTerminal
      targetKind="plan"
      targetId={plan.id}
      sessionEndpoint={`/api/plans/${plan.id}/session`}
      openTerminalEndpoint={`/api/plans/${plan.id}/session`}
      sessionVersion={plan.phase}
    />
  );
}
