'use client';

interface ArchiveFilterProps {
  showArchived: boolean;
  onToggle: (show: boolean) => void;
}

export function ArchiveFilter({ showArchived, onToggle }: ArchiveFilterProps) {
  return (
    <button
      onClick={() => onToggle(!showArchived)}
      className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors ${
        showArchived
          ? 'bg-accent/10 text-accent border-accent'
          : 'bg-bg-secondary text-text-primary hover:bg-bg-hover'
      }`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
      {showArchived ? 'Archived Tasks' : 'Active Tasks'}
    </button>
  );
}