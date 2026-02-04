import type { Metadata } from 'next';
import './globals.css';
import 'xterm/css/xterm.css';
import { NotificationProvider } from '@/components/providers/NotificationProvider';

export const metadata: Metadata = {
  title: 'Mark2 - Agentic Orchestration',
  description: 'Dark-mode Kanban board for agentic task orchestration',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </body>
    </html>
  );
}
