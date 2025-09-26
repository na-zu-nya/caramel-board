import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SetupGuide, type SetupGuideProps } from './index';

const meta: Meta<typeof SetupGuide> = {
  title: 'Setup/SetupGuide',
  component: SetupGuide,
};

export default meta;

type Story = StoryObj<typeof SetupGuide>;

const stepsMock: SetupGuideProps['steps'] = [
  {
    id: 'intro',
    eyebrow: 'Step 1',
    title: 'ライブラリを作成しましょう',
    description: 'まずは最初のライブラリを準備します。あとからいくつでも追加できます。',
    illustration: (
      <div className="flex h-40 items-center justify-center rounded-lg bg-gradient-to-br from-amber-200 to-rose-200 text-lg font-semibold text-slate-700">
        Illustration
      </div>
    ),
  },
  {
    id: 'customize',
    eyebrow: 'Step 2',
    title: 'アイコンとカラーを選ぶ',
    description: 'カラーとアイコンはいつでも変更可能です。雰囲気に合わせて選択しましょう。',
    content: (
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>・カラーパレットはカラメルテーマが既定値です。</li>
        <li>・ライブラリの目的に応じて名前を決めてください。</li>
      </ul>
    ),
  },
  {
    id: 'pins',
    eyebrow: 'Step 3',
    title: 'Pins を活用する',
    description: 'お気に入り・画像・コミック・動画など、よく使うビューをピン留めできます。',
  },
];

export const Default: Story = {
  render: (args) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const steps = args.steps ?? stepsMock;
    const maxIndex = Math.max(steps.length - 1, 0);

    return (
      <div className="mx-auto max-w-3xl">
        <SetupGuide
          {...args}
          steps={steps}
          activeIndex={activeIndex}
          onRequestPrev={() => setActiveIndex((prev) => Math.max(prev - 1, 0))}
          onRequestNext={() => setActiveIndex((prev) => Math.min(prev + 1, maxIndex))}
          onStepSelect={(index) => setActiveIndex(index)}
        />
      </div>
    );
  },
  args: {
    steps: stepsMock,
  },
};
