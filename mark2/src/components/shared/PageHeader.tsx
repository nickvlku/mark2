'use client';

import { ReactNode } from 'react';
import { TopNavigation } from './TopNavigation';

interface PageHeaderProps {
  title: string;
  currentPage: 'board' | 'agents';
  actions?: ReactNode;
  additionalElements?: ReactNode;
}

export function PageHeader({ title, currentPage, actions, additionalElements }: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">
          <span className="text-accent">Mark2</span> {title}
        </h1>
        <TopNavigation currentPage={currentPage} />
        {additionalElements}
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}