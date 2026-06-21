import { Copy, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClipperApiKeyState } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface ExtensionIntegrationCopy {
  title: string;
  description: string;
  configured: string;
  notConfigured: string;
  keyPreview: string;
  createdAt: string;
  issueKey: string;
  regenerateKey: string;
  revokeKey: string;
  copyKey: string;
  generatedKeyLabel: string;
  generatedKeyHint: string;
}

export interface ExtensionIntegrationSectionProps {
  state: ClipperApiKeyState | null;
  generatedApiKey: string | null;
  loading?: boolean;
  issuing?: boolean;
  revoking?: boolean;
  copy: ExtensionIntegrationCopy;
  feedback?: string | null;
  onIssueKey: () => void;
  onRevokeKey: () => void;
  onCopyGeneratedKey: () => void;
  onCopyStoredKey: () => void;
}

export function ExtensionIntegrationSection({
  state,
  generatedApiKey,
  loading = false,
  issuing = false,
  revoking = false,
  copy,
  feedback,
  onIssueKey,
  onRevokeKey,
  onCopyGeneratedKey,
  onCopyStoredKey,
}: ExtensionIntegrationSectionProps) {
  const configured = Boolean(state?.configured);
  const busy = loading || issuing || revoking;
  const canCopyStoredKey = Boolean(state?.apiKey && !generatedApiKey);

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
            <KeyRound size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{copy.title}</h2>
            {copy.description ? (
              <p className="mt-1 text-sm text-gray-500">{copy.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              configured ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
            )}
          >
            {configured ? copy.configured : copy.notConfigured}
          </span>
          {state?.keyPreview ? (
            <span className="inline-flex items-center gap-2">
              <span className="font-mono text-xs text-gray-500">
                {copy.keyPreview}: {state.keyPreview}
              </span>
              {canCopyStoredKey ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onCopyStoredKey}
                  disabled={busy}
                  className="h-7 px-2 text-xs"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {copy.copyKey}
                </Button>
              ) : null}
            </span>
          ) : null}
          {state?.createdAt ? (
            <span className="text-xs text-gray-500">
              {copy.createdAt}: {new Date(state.createdAt).toLocaleString()}
            </span>
          ) : null}
        </div>

        {generatedApiKey ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="mb-2 text-sm font-semibold text-amber-900">
              {copy.generatedKeyLabel}
            </div>
            <div className="flex min-w-0 gap-2">
              <input
                readOnly
                value={generatedApiKey}
                className="h-9 min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-3 font-mono text-xs text-gray-900"
              />
              <Button type="button" size="sm" variant="outline" onClick={onCopyGeneratedKey}>
                <Copy className="mr-2 h-4 w-4" />
                {copy.copyKey}
              </Button>
            </div>
            <p className="mt-2 text-xs text-amber-800">{copy.generatedKeyHint}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onIssueKey} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {configured ? copy.regenerateKey : copy.issueKey}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onRevokeKey}
            disabled={busy || !configured}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {copy.revokeKey}
          </Button>
        </div>

        {feedback ? <p className="text-sm font-medium text-gray-600">{feedback}</p> : null}
      </div>
    </section>
  );
}
