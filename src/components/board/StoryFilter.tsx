'use client';

import { useState, useRef, useEffect } from 'react';
import type { Story, Task } from '@/types';

interface StoryFilterProps {
  stories: Story[];
  tasks: Task[];
  selectedStoryId: string | null;
  onSelect: (storyId: string | null) => void;
}

export function StoryFilter({ stories, tasks, selectedStoryId, onSelect }: StoryFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedStory = stories.find((s) => s.id === selectedStoryId);

  function taskCountForStory(storyId: string): number {
    return tasks.filter((t) => t.story_id === storyId).length;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
      >
        <svg className="h-4 w-4 text-text-secondary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
        {selectedStory ? selectedStory.title : 'All Tasks'}
        <svg className={`h-4 w-4 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-border bg-bg-secondary shadow-xl">
          <div className="p-1">
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                !selectedStoryId ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-bg-hover'
              }`}
            >
              <span className="font-medium">All Tasks</span>
              <span className="ml-auto text-xs text-text-secondary">{tasks.length}</span>
            </button>
            {stories.map((story) => (
              <button
                key={story.id}
                onClick={() => { onSelect(story.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  selectedStoryId === story.id ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-bg-hover'
                }`}
              >
                <span className="truncate font-medium">{story.title}</span>
                <span className="ml-auto shrink-0 text-xs text-text-secondary">
                  {taskCountForStory(story.id)}
                </span>
              </button>
            ))}
            {stories.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-text-secondary">
                No stories yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
