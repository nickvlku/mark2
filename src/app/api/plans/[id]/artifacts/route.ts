import { NextResponse } from 'next/server';
import { createPlanService } from '@/lib/services/factory';
import { isValidPlanId } from '@/lib/utils/route-validation';

const service = createPlanService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const plan = service.getById(id);
    if (!plan) {
      return NextResponse.json({ error: `Plan ${id} not found` }, { status: 404 });
    }

    return NextResponse.json({ artifacts: plan.artifacts });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get artifacts' },
      { status: 500 },
    );
  }
}
