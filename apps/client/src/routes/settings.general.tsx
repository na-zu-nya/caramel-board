import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Languages } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { ExtensionIntegrationSection } from '@/components/settings/ExtensionIntegrationSection';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient, type ClipperApiKeyState } from '@/lib/api-client';
import { type AppLanguage, isAppLanguage, useLanguage, useSetLanguage, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/settings/general')({
  component: GeneralSettings,
});

const CLIPPER_API_KEY_QUERY_KEY = ['clipper-api-key'] as const;

const copyTextToClipboard = async (value: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the legacy path for non-secure local contexts.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
};

function GeneralSettings() {
  const t = useT();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const queryClient = useQueryClient();
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [clipperFeedback, setClipperFeedback] = useState<string | null>(null);

  const clipperApiKeyQuery = useQuery({
    queryKey: CLIPPER_API_KEY_QUERY_KEY,
    queryFn: () => apiClient.getClipperApiKeyState(),
  });

  const issueClipperApiKeyMutation = useMutation({
    mutationFn: () => apiClient.issueClipperApiKey(),
    onSuccess: (data) => {
      const nextState: ClipperApiKeyState = {
        configured: data.configured,
        keyPreview: data.keyPreview,
        createdAt: data.createdAt,
        apiKey: data.apiKey,
      };
      setGeneratedApiKey(data.apiKey);
      setClipperFeedback(null);
      queryClient.setQueryData(CLIPPER_API_KEY_QUERY_KEY, nextState);
    },
  });

  const revokeClipperApiKeyMutation = useMutation({
    mutationFn: () => apiClient.revokeClipperApiKey(),
    onSuccess: (data) => {
      setGeneratedApiKey(null);
      setClipperFeedback(null);
      queryClient.setQueryData(CLIPPER_API_KEY_QUERY_KEY, {
        configured: data.configured,
        keyPreview: data.keyPreview,
        createdAt: data.createdAt,
        apiKey: data.apiKey,
      });
    },
  });

  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: false,
      showFilter: false,
      showSelection: false,
    }),
    []
  );

  useHeaderActions(headerActionsConfig);

  const languageOptions = useMemo(
    () =>
      [
        { value: 'ja', label: t.settings.languageJapanese },
        { value: 'en', label: t.settings.languageEnglish },
      ] satisfies Array<{ value: AppLanguage; label: string }>,
    [t]
  );

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      if (!isAppLanguage(nextLanguage)) return;
      setLanguage(nextLanguage);
    },
    [setLanguage]
  );

  const handleIssueClipperApiKey = useCallback(() => {
    issueClipperApiKeyMutation.mutate();
  }, [issueClipperApiKeyMutation]);

  const handleRevokeClipperApiKey = useCallback(() => {
    revokeClipperApiKeyMutation.mutate();
  }, [revokeClipperApiKeyMutation]);

  const handleCopyGeneratedApiKey = useCallback(async () => {
    if (!generatedApiKey) return;
    const copied = await copyTextToClipboard(generatedApiKey);
    setClipperFeedback(copied ? t.settings.extensionKeyCopied : t.settings.extensionKeyCopyFailed);
  }, [generatedApiKey, t]);

  const handleCopyStoredApiKey = useCallback(async () => {
    const apiKey = clipperApiKeyQuery.data?.apiKey;
    if (!apiKey) return;
    const copied = await copyTextToClipboard(apiKey);
    setClipperFeedback(copied ? t.settings.extensionKeyCopied : t.settings.extensionKeyCopyFailed);
  }, [clipperApiKeyQuery.data?.apiKey, t]);

  const extensionIntegrationCopy = useMemo(
    () => ({
      title: t.settings.extensionIntegrationTitle,
      description: t.settings.extensionIntegrationDescription,
      configured: t.settings.extensionIntegrationConfigured,
      notConfigured: t.settings.extensionIntegrationNotConfigured,
      keyPreview: t.settings.extensionIntegrationKeyPreview,
      createdAt: t.settings.extensionIntegrationCreatedAt,
      issueKey: t.settings.extensionIntegrationIssueKey,
      regenerateKey: t.settings.extensionIntegrationRegenerateKey,
      revokeKey: t.settings.extensionIntegrationRevokeKey,
      copyKey: t.settings.extensionIntegrationCopyKey,
      generatedKeyLabel: t.settings.extensionIntegrationGeneratedKeyLabel,
      generatedKeyHint: t.settings.extensionIntegrationGeneratedKeyHint,
    }),
    [t]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto max-w-3xl px-4 py-8 pt-24">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{t.settings.generalTitle}</h1>
          {t.settings.generalDescription ? (
            <p className="mt-1 text-sm text-gray-500">{t.settings.generalDescription}</p>
          ) : null}
        </div>

        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Languages size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {t.settings.languageTitle}
                </h2>
                {t.settings.languageDescription ? (
                  <p className="mt-1 text-sm text-gray-500">{t.settings.languageDescription}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <RadioGroup
              value={language}
              onValueChange={handleLanguageChange}
              className="grid gap-3 sm:grid-cols-2"
            >
              {languageOptions.map((option) => {
                const selected = option.value === language;

                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors',
                      selected
                        ? 'border-primary bg-primary/5 text-gray-900'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <RadioGroupItem value={option.value} />
                    <span className="text-sm font-medium">{option.label}</span>
                    {selected ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
                  </label>
                );
              })}
            </RadioGroup>
          </div>
        </section>

        <div className="mt-6">
          <ExtensionIntegrationSection
            state={clipperApiKeyQuery.data ?? null}
            generatedApiKey={generatedApiKey}
            loading={clipperApiKeyQuery.isLoading}
            issuing={issueClipperApiKeyMutation.isPending}
            revoking={revokeClipperApiKeyMutation.isPending}
            copy={extensionIntegrationCopy}
            feedback={clipperFeedback}
            onIssueKey={handleIssueClipperApiKey}
            onRevokeKey={handleRevokeClipperApiKey}
            onCopyGeneratedKey={handleCopyGeneratedApiKey}
            onCopyStoredKey={handleCopyStoredApiKey}
          />
        </div>
      </div>
    </div>
  );
}
