import type { Preview } from '@storybook/react';
import '../src/styles.css';
import { type ReactNode, useEffect } from 'react';
import { DragProvider } from '../src/contexts/DragContext';
import { type AppLanguage, isAppLanguage, useSetLanguage } from '../src/lib/i18n';
import { installThumbnailBlurConsoleCommand } from '../src/lib/thumbnail-blur';

if (typeof window !== 'undefined') {
  installThumbnailBlurConsoleCommand(window);
}

function StorybookProviders({
  children,
  language,
}: {
  children: ReactNode;
  language: AppLanguage;
}) {
  const setLanguage = useSetLanguage();

  useEffect(() => {
    setLanguage(language);
  }, [language, setLanguage]);

  return (
    <DragProvider>
      <div style={{ padding: 16 }}>{children}</div>
    </DragProvider>
  );
}

const preview: Preview = {
  globalTypes: {
    locale: {
      description: 'UI language',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'ja', title: '日本語' },
        ],
      },
    },
  },
  initialGlobals: {
    locale: 'ja',
  },
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    options: {
      storySort: {
        order: ['Overview', 'Components', 'Pages'],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const language = isAppLanguage(context.globals.locale) ? context.globals.locale : 'ja';

      return (
        <StorybookProviders language={language}>
          <Story />
        </StorybookProviders>
      );
    },
  ],
};

export default preview;
