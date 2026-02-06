'use client';

export type ViewMode = 'flat' | 'grouped';

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-bg-card p-0.5">
      <button
        onClick={() => onChange('flat')}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          mode === 'flat'
            ? 'bg-accent text-white'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
        }`}
      >
        Flat
      </button>
      <button
        onClick={() => onChange('grouped')}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          mode === 'grouped'
            ? 'bg-accent text-white'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
        }`}
      >
        By Story
      </button>
    </div>
  );
}
