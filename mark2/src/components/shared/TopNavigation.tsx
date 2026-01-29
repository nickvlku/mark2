'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TopNavigationProps {
  currentPage: 'board' | 'agents' | 'roles';
}

export function TopNavigation({ currentPage }: TopNavigationProps) {
  const pathname = usePathname();
  
  // Determine active page based on pathname as fallback
  const isBoard = currentPage === 'board' || pathname === '/';
  const isAgents = currentPage === 'agents' || pathname === '/agents';
  const isRoles = currentPage === 'roles' || pathname === '/roles';

  return (
    <nav className="flex items-center gap-3">
      <Link 
        href="/" 
        className={`text-sm transition-colors ${
          isBoard
            ? 'text-text-primary font-medium'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        Board
      </Link>
      <span className="text-text-secondary">•</span>
      <Link 
        href="/roles" 
        className={`text-sm transition-colors ${
          isRoles
            ? 'text-text-primary font-medium'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        Roles
      </Link>
      <span className="text-text-secondary">•</span>
      <Link 
        href="/agents" 
        className={`text-sm transition-colors ${
          isAgents
            ? 'text-text-primary font-medium'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        Agents (Legacy)
      </Link>
    </nav>
  );
}
