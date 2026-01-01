import { type ReactNode } from 'react';

interface SidebarProps {
  children: ReactNode;
  className?: string;
}

export function Sidebar({ children, className = '' }: SidebarProps) {
  return (
    <aside className={`rabies-sidebar ${className}`.trim()}>
      {children}
    </aside>
  );
}
