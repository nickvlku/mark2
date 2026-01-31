'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-text-primary mb-3 mt-4 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-text-primary mb-2 mt-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-text-primary mb-2 mt-3">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-text-secondary mb-2 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside text-sm text-text-secondary mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside text-sm text-text-secondary mb-2 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-text-secondary">{children}</li>
          ),
          code: ({ className: codeClassName, children }) => {
            const isBlock = codeClassName?.startsWith('language-');
            if (isBlock) {
              return (
                <pre className="rounded-lg bg-bg-primary border border-border p-3 overflow-x-auto my-2">
                  <code className="text-xs text-green-400 font-mono">{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-bg-primary border border-border px-1.5 py-0.5 text-xs text-indigo-400 font-mono">
                {children}
              </code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-indigo-500 pl-3 my-2 italic text-text-secondary">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-bg-primary px-3 py-2 text-left text-xs font-medium text-text-secondary uppercase">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2 text-sm text-text-secondary">{children}</td>
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-indigo-400 hover:text-indigo-300 underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          hr: () => <hr className="border-border my-4" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
