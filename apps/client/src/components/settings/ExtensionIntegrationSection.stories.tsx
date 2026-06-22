import type { Meta, StoryObj } from '@storybook/react';
import { ExtensionIntegrationSection } from './ExtensionIntegrationSection';

const copy = {
  title: 'Browser Extension',
  description: 'Issue a Clipper key for the browser extension.',
  configured: 'Configured',
  notConfigured: 'Not configured',
  keyPreview: 'Key',
  createdAt: 'Created',
  issueKey: 'Issue key',
  regenerateKey: 'Regenerate key',
  revokeKey: 'Revoke key',
  copyKey: 'Copy',
  generatedKeyLabel: 'New key',
  generatedKeyHint: 'Paste this key into the Clipper options page.',
};

const meta: Meta<typeof ExtensionIntegrationSection> = {
  title: 'Settings/ExtensionIntegrationSection',
  component: ExtensionIntegrationSection,
  args: {
    state: {
      configured: true,
      keyPreview: 'cb_clip_a1b2c3d4...',
      createdAt: '2026-06-20T00:00:00.000Z',
      apiKey: 'cb_clip_a1b2c3d4StoredKeyForClipperOptions',
    },
    generatedApiKey: null,
    loading: false,
    issuing: false,
    revoking: false,
    copy,
    feedback: null,
    onIssueKey: () => {},
    onRevokeKey: () => {},
    onCopyGeneratedKey: () => {},
    onCopyStoredKey: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ExtensionIntegrationSection>;

export const Configured: Story = {};

export const Generated: Story = {
  args: {
    generatedApiKey: 'cb_clip_exampleGeneratedKeyForClipperOptions',
    feedback: 'Copied',
  },
};

export const NotConfigured: Story = {
  args: {
    state: {
      configured: false,
      keyPreview: null,
      createdAt: null,
      apiKey: null,
    },
  },
};
