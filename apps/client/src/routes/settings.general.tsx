import { createFileRoute } from '@tanstack/react-router';
import { Check, Languages } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { type AppLanguage, isAppLanguage, useLanguage, useSetLanguage, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/settings/general')({
  component: GeneralSettings,
});

function GeneralSettings() {
  const t = useT();
  const language = useLanguage();
  const setLanguage = useSetLanguage();

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto max-w-3xl px-4 py-8 pt-24">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{t.settings.generalTitle}</h1>
          <p className="mt-1 text-sm text-gray-500">{t.settings.generalDescription}</p>
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
                <p className="mt-1 text-sm text-gray-500">{t.settings.languageDescription}</p>
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

            <p className="mt-4 text-xs text-gray-500">
              {t.settings.languageCurrent}: {language === 'ja' ? '日本語' : 'English'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
