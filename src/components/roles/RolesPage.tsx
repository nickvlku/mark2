'use client';

import { useState, useCallback } from 'react';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { Role } from '@/types';
import { useRoles } from '@/hooks/useRoles';
import { CreateRoleDialog } from './CreateRoleDialog';
import { EditRoleDialog } from './EditRoleDialog';
import { ImportRolesDialog } from './ImportRolesDialog';
import { Dialog } from '@/components/shared/Dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PhaseDefaultsSection } from './PhaseDefaultsSection';
import { PlanPhaseDefaultsSection } from './PlanPhaseDefaultsSection';

export function RolesPage() {
  const { roles, mutate: mutateRoles, isLoading, error } = useRoles();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);

  const handleCreateRole = useCallback(
    async (newRole: Role) => {
      const updatedRoles = [...roles, newRole];

      // Optimistic update
      mutateRoles({ roles: updatedRoles }, false);

      try {
        const response = await fetch('/api/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: updatedRoles }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Failed to save role:', errorData);
          // Revert on error
          await mutateRoles();
          return;
        }

        // Revalidate to ensure consistency
        await mutateRoles();
      } catch (err) {
        console.error('Failed to save role:', err);
        await mutateRoles();
      }

      setShowCreateDialog(false);
    },
    [roles, mutateRoles]
  );

  const handleUpdateRole = useCallback(
    async (updatedRole: Role) => {
      const updatedRoles = roles.map((role) =>
        role.name === updatedRole.name ? updatedRole : role
      );

      // Optimistic update
      mutateRoles({ roles: updatedRoles }, false);

      try {
        const response = await fetch('/api/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: updatedRoles }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Failed to update role:', errorData);
          await mutateRoles();
          return;
        }

        await mutateRoles();
      } catch (err) {
        console.error('Failed to update role:', err);
        await mutateRoles();
      }

      setEditingRole(null);
    },
    [roles, mutateRoles]
  );

  const handleDeleteRole = useCallback(async () => {
    if (!deletingRole) return;

    const updatedRoles = roles.filter((role) => role.name !== deletingRole.name);

    // Optimistic update
    mutateRoles({ roles: updatedRoles }, false);

    try {
      const response = await fetch('/api/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: updatedRoles }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to delete role:', errorData);
        await mutateRoles();
        return;
      }

      await mutateRoles();
    } catch (err) {
      console.error('Failed to delete role:', err);
      await mutateRoles();
    }

    setDeletingRole(null);
  }, [deletingRole, roles, mutateRoles]);

  const handleImportRoles = useCallback(
    async (newRoles: Role[]) => {
      // Filter out roles that already exist (by name)
      const existingNames = new Set(roles.map((r) => r.name));
      const rolesToAdd = newRoles.filter((r) => !existingNames.has(r.name));

      if (rolesToAdd.length === 0) {
        setShowImportDialog(false);
        return;
      }

      const updatedRoles = [...roles, ...rolesToAdd];

      // Optimistic update
      mutateRoles({ roles: updatedRoles }, false);

      try {
        const response = await fetch('/api/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: updatedRoles }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Failed to import roles:', errorData);
          await mutateRoles();
          return;
        }

        await mutateRoles();
      } catch (err) {
        console.error('Failed to import roles:', err);
        await mutateRoles();
      }

      setShowImportDialog(false);
    },
    [roles, mutateRoles]
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-text-secondary">Loading roles...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-red-400">Error loading roles: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top Bar */}
      <PageHeader
        title="Roles"
        currentPage="roles"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportDialog(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
            >
              <SparklesIcon className="h-4 w-4" />
              Import Templates
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Create Role
            </button>
          </div>
        }
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Phase Defaults Section */}
        <PhaseDefaultsSection roles={roles} />

        {/* Plan Phase Defaults Section */}
        <PlanPhaseDefaultsSection roles={roles} />

        {/* Roles Grid */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">All Roles</h2>
          {roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center rounded-lg border border-border bg-bg-card">
              <div className="text-text-secondary mb-4">No roles configured</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImportDialog(true)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
                >
                  <SparklesIcon className="h-4 w-4" />
                  Import Templates
                </button>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create Role
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => (
                <RoleCard
                  key={role.name}
                  role={role}
                  onEdit={() => setEditingRole(role)}
                  onDelete={() => setDeletingRole(role)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showCreateDialog && (
        <CreateRoleDialog
          existingRoles={roles}
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreateRole}
        />
      )}

      {showImportDialog && (
        <ImportRolesDialog
          existingRoles={roles}
          onClose={() => setShowImportDialog(false)}
          onImport={handleImportRoles}
        />
      )}

      {editingRole && (
        <EditRoleDialog
          role={editingRole}
          existingRoles={roles}
          onClose={() => setEditingRole(null)}
          onUpdate={handleUpdateRole}
        />
      )}

      {deletingRole && (
        <Dialog
          open={true}
          onClose={() => setDeletingRole(null)}
          title="Delete Role"
          description={`Are you sure you want to delete the role "${deletingRole.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDeleteRole}
          variant="danger"
        />
      )}
    </div>
  );
}

interface RoleCardProps {
  role: Role;
  onEdit: () => void;
  onDelete: () => void;
}

function RoleCard({ role, onEdit, onDelete }: RoleCardProps) {
  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'design':
        return 'bg-indigo-500/20 text-indigo-300';
      case 'coding':
        return 'bg-emerald-500/20 text-emerald-300';
      case 'testing':
        return 'bg-orange-500/20 text-orange-300';
      case 'code_review':
        return 'bg-cyan-500/20 text-cyan-300';
      case 'run_test_plan':
        return 'bg-pink-500/20 text-pink-300';
      default:
        return 'bg-gray-500/20 text-gray-300';
    }
  };

  const formatPhase = (phase: string) => {
    return phase
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4 hover:bg-bg-hover transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-text-primary">{role.name}</h3>
          {role.description && (
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
              {role.description}
            </p>
          )}
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {role.suggested_phases.map((phase) => (
              <span
                key={phase}
                className={`px-2 py-0.5 rounded text-xs font-medium ${getPhaseColor(phase)}`}
              >
                {formatPhase(phase)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={onEdit}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            title="Edit role"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-bg-hover rounded transition-colors"
            title="Delete role"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="text-xs text-text-secondary mb-2">
        Timeout: {role.timeout_minutes} minutes
      </div>

      <div className="text-sm text-text-secondary">
        <div className="font-medium mb-1">Role Prompt:</div>
        <div className="line-clamp-3 text-xs bg-bg-secondary rounded p-2 font-mono">
          {role.role_prompt}
        </div>
      </div>
    </div>
  );
}
