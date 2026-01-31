'use client';

import { useState, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { Role, AssignablePhase } from '@/types';
import { ASSIGNABLE_PHASES } from '@/lib/yaml/schemas';

interface CreateRoleDialogProps {
  existingRoles: Role[];
  onClose: () => void;
  onCreate: (role: Role) => void;
}

const PHASE_OPTIONS: { id: AssignablePhase; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'coding', label: 'Coding' },
  { id: 'testing', label: 'Testing' },
  { id: 'code_review', label: 'Code Review' },
  { id: 'manual_testing', label: 'Manual Testing' },
];

export function CreateRoleDialog({
  existingRoles,
  onClose,
  onCreate,
}: CreateRoleDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rolePrompt, setRolePrompt] = useState('');
  const [suggestedPhases, setSuggestedPhases] = useState<AssignablePhase[]>([]);
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateName = useCallback(
    (value: string) => {
      if (!value) return 'Name is required';
      if (!/^[a-z][a-z0-9-]*$/.test(value)) {
        return 'Name must be lowercase alphanumeric with hyphens, starting with a letter';
      }
      if (existingRoles.some((r) => r.name === value)) {
        return 'A role with this name already exists';
      }
      return '';
    },
    [existingRoles]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const newErrors: Record<string, string> = {};

      const nameError = validateName(name);
      if (nameError) newErrors.name = nameError;

      if (!rolePrompt.trim()) {
        newErrors.rolePrompt = 'Role prompt is required';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      onCreate({
        name,
        description: description || undefined,
        role_prompt: rolePrompt,
        suggested_phases: suggestedPhases,
        timeout_minutes: timeoutMinutes,
      });
    },
    [name, description, rolePrompt, suggestedPhases, timeoutMinutes, validateName, onCreate]
  );

  const togglePhase = useCallback((phase: AssignablePhase) => {
    setSuggestedPhases((prev) =>
      prev.includes(phase)
        ? prev.filter((p) => p !== phase)
        : [...prev, phase]
    );
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-lg bg-bg-card border border-border shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Create Role</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder="expert-fullstack-coder"
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-400">{errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the role"
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Suggested Phases */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Suggested Phases
            </label>
            <div className="flex flex-wrap gap-2">
              {PHASE_OPTIONS.map((phase) => (
                <button
                  key={phase.id}
                  type="button"
                  onClick={() => togglePhase(phase.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    suggestedPhases.includes(phase.id)
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  {phase.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              Select phases where this role is typically used
            </p>
          </div>

          {/* Timeout */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Timeout (minutes)
            </label>
            <input
              type="number"
              value={timeoutMinutes}
              onChange={(e) => setTimeoutMinutes(parseInt(e.target.value) || 60)}
              min={1}
              className="w-32 rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Role Prompt */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Role Prompt *
            </label>
            <textarea
              value={rolePrompt}
              onChange={(e) => {
                setRolePrompt(e.target.value);
                setErrors((prev) => ({ ...prev, rolePrompt: '' }));
              }}
              placeholder="You are an expert..."
              rows={8}
              className="w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono"
            />
            {errors.rolePrompt && (
              <p className="mt-1 text-xs text-red-400">{errors.rolePrompt}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-accent text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Create Role
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
