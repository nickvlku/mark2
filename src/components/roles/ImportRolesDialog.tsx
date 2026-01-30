'use client';

import { useState, useMemo, useCallback } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import type { Role, AssignablePhase } from '@/types';
import { ROLE_TEMPLATES, templateToRole } from '@/lib/constants/default-roles';

interface ImportRolesDialogProps {
  existingRoles: Role[];
  onClose: () => void;
  onImport: (roles: Role[]) => void;
}

export function ImportRolesDialog({
  existingRoles,
  onClose,
  onImport,
}: ImportRolesDialogProps) {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  // Filter out templates that already exist
  const availableTemplates = useMemo(() => {
    const existingNames = new Set(existingRoles.map((r) => r.name));
    return ROLE_TEMPLATES.filter((t) => !existingNames.has(t.name));
  }, [existingRoles]);

  // Group templates by suggested phase
  const templatesByPhase = useMemo(() => {
    const groups: Record<string, typeof ROLE_TEMPLATES> = {
      design: [],
      coding: [],
      testing: [],
      code_review: [],
      manual_testing: [],
    };

    for (const template of availableTemplates) {
      const primaryPhase = template.suggested_phases[0];
      if (primaryPhase && groups[primaryPhase]) {
        groups[primaryPhase].push(template);
      }
    }

    return groups;
  }, [availableTemplates]);

  const toggleSelection = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedNames(new Set(availableTemplates.map((t) => t.name)));
  }, [availableTemplates]);

  const selectNone = useCallback(() => {
    setSelectedNames(new Set());
  }, []);

  const handleImport = useCallback(() => {
    const rolesToImport = availableTemplates
      .filter((t) => selectedNames.has(t.name))
      .map(templateToRole);
    onImport(rolesToImport);
  }, [availableTemplates, selectedNames, onImport]);

  const formatPhase = (phase: string) => {
    return phase
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (availableTemplates.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-lg bg-bg-card border border-border shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              Import Role Templates
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-text-secondary hover:text-text-primary transition-colors"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="text-text-secondary text-sm">
            All available role templates have already been imported.
          </p>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-bg-secondary text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-lg bg-bg-card border border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            Import Role Templates
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border">
          <span className="text-sm text-text-secondary">
            {selectedNames.size} of {availableTemplates.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-sm text-accent hover:underline"
            >
              Select All
            </button>
            <span className="text-text-secondary">|</span>
            <button
              onClick={selectNone}
              className="text-sm text-accent hover:underline"
            >
              Select None
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          {Object.entries(templatesByPhase).map(([phase, templates]) => {
            if (templates.length === 0) return null;

            return (
              <div key={phase}>
                <h3 className="text-sm font-semibold text-text-primary mb-2">
                  {formatPhase(phase)}
                </h3>
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.name}
                      onClick={() => toggleSelection(template.name)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedNames.has(template.name)
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-bg-secondary hover:bg-bg-hover'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center ${
                            selectedNames.has(template.name)
                              ? 'bg-accent border-accent'
                              : 'border-border'
                          }`}
                        >
                          {selectedNames.has(template.name) && (
                            <CheckIcon className="h-3 w-3 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">
                              {template.name}
                            </span>
                            <span className="text-xs text-text-secondary">
                              {template.timeout_minutes}min
                            </span>
                          </div>
                          <p className="text-sm text-text-secondary mt-0.5">
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={selectedNames.size === 0}
            className="px-4 py-2 rounded-lg bg-accent text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import {selectedNames.size} Role{selectedNames.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
