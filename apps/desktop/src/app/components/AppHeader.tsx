import type { LucideIcon } from 'lucide-react';
import { ExternalLink, Github, Megaphone, RefreshCcw, Twitter } from 'lucide-react';
import type { MouseEvent } from 'react';
import { CaramelBoardLogo } from '../../shared/brand/CaramelBoardLogo';
import { APP_GIT_HASH, APP_VERSION, FANBOX_URL, GITHUB_URL, X_URL } from '../constants';

interface AppHeaderProps {
  running: boolean;
  displayUrl: string;
  busy: boolean;
  openBrowserLabel: string;
  refreshStatusLabel: string;
  actionLabel: string;
  ActionIcon: LucideIcon;
  onRefreshStatus: () => void;
  onOpenBrowser: () => void;
  onToggleSidecar: () => void;
  onOpenBrandLink: (event: MouseEvent<HTMLAnchorElement>) => void;
  onOpenExternalLink: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function AppHeader({
  running,
  displayUrl,
  busy,
  openBrowserLabel,
  refreshStatusLabel,
  actionLabel,
  ActionIcon,
  onRefreshStatus,
  onOpenBrowser,
  onToggleSidecar,
  onOpenBrandLink,
  onOpenExternalLink,
}: AppHeaderProps) {
  return (
    <header className="top-bar">
      <div className="brand-block">
        <a
          className={running ? 'brand-link' : 'brand-link disabled'}
          href={running ? displayUrl : '#'}
          aria-label="Caramel Board"
          onClick={onOpenBrandLink}
        >
          <CaramelBoardLogo className="brand-logo" />
        </a>
        <div className="brand-support" aria-label="Application information">
          <div className="brand-version">
            <span>v{APP_VERSION}</span>
            <span className="brand-hash">#{APP_GIT_HASH}</span>
          </div>
          <div className="brand-social-links">
            <a href={FANBOX_URL} aria-label="FANBOX" title="FANBOX" onClick={onOpenExternalLink}>
              <Megaphone size={14} aria-hidden="true" />
            </a>
            <a href={X_URL} aria-label="X" title="X" onClick={onOpenExternalLink}>
              <Twitter size={14} aria-hidden="true" />
            </a>
            <a href={GITHUB_URL} aria-label="GitHub" title="GitHub" onClick={onOpenExternalLink}>
              <Github size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <div className="service-controls">
        <button
          type="button"
          className="refresh-button"
          onClick={onRefreshStatus}
          disabled={busy}
          title={refreshStatusLabel}
        >
          <RefreshCcw size={15} />
        </button>
        <button
          type="button"
          className="browser-button"
          onClick={onOpenBrowser}
          disabled={busy || !running}
        >
          <ExternalLink size={15} />
          {openBrowserLabel}
        </button>
        <button
          type="button"
          className={running ? 'fixed-service-button stop' : 'fixed-service-button start'}
          onClick={onToggleSidecar}
          disabled={busy}
        >
          <ActionIcon size={16} />
          {actionLabel}
        </button>
      </div>
    </header>
  );
}
