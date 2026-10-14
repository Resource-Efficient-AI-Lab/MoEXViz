import type { ReactNode } from 'react';

interface ProjectResource {
  label: string;
  href?: string;
  icon: ReactNode;
}

// Add the paper and video URLs here when they are available.
const PROJECT_RESOURCES: ProjectResource[] = [
  {
    label: 'Research paper',
    icon: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </>
    ),
  },
  {
    label: 'GitHub repository',
    href: 'https://github.com/Resource-Efficient-AI-Lab/MoEXViz',
    icon: (
      <path
        fill="currentColor"
        stroke="none"
        d="M12 .297C5.37.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.469-2.38 1.236-3.22-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0 1 12 6.099c1.02.005 2.045.138 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.805 5.625-5.478 5.922.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      />
    ),
  },
  {
    label: 'Video walkthrough',
    icon: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="4" />
        <path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none" />
      </>
    ),
  },
];

export function ProjectLinks() {
  return (
    <nav className="project-links" aria-label="Project resources">
      {PROJECT_RESOURCES.map(({ label, href, icon }) => {
        const symbol = (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {icon}
          </svg>
        );

        return href ? (
          <a
            key={label}
            className="project-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label} (opens in a new tab)`}
            title={label}
          >
            {symbol}
          </a>
        ) : (
          <span key={label} title={`${label} (coming soon)`}>
            <button
              className="project-link"
              type="button"
              disabled
              aria-label={`${label} (coming soon)`}
            >
              {symbol}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
