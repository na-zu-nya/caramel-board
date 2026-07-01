export const DEBUG_CHANNELS = ['viewer-loader'] as const;

export type DebugChannel = (typeof DEBUG_CHANNELS)[number];

type DebugSnapshot = unknown;

type DebugStatus = Record<DebugChannel, boolean>;

type CaramelDebugConsole = {
  channels: readonly DebugChannel[];
  enable: (channel?: DebugChannel) => DebugStatus;
  disable: (channel?: DebugChannel) => DebugStatus;
  status: () => DebugStatus;
  snapshot: (channel?: DebugChannel) => DebugSnapshot;
};

declare global {
  interface Window {
    CaramelDebug?: CaramelDebugConsole;
  }
}

const DEBUG_STORAGE_PREFIX = 'caramel.debug.';
const DEFAULT_DEBUG_CHANNEL: DebugChannel = 'viewer-loader';

const snapshots = new Map<DebugChannel, DebugSnapshot>();

const getDebugStorageKey = (channel: DebugChannel) => `${DEBUG_STORAGE_PREFIX}${channel}`;

const getStorage = (windowRef: Window): Storage | null => {
  try {
    return windowRef.localStorage;
  } catch {
    return null;
  }
};

export const isDebugChannelEnabled = (
  channel: DebugChannel,
  windowRef: Window | undefined = typeof window === 'undefined' ? undefined : window
): boolean => {
  if (!windowRef) return false;
  const storage = getStorage(windowRef);
  if (!storage) return false;
  return storage.getItem(getDebugStorageKey(channel)) === '1';
};

const setDebugChannelEnabled = (
  channel: DebugChannel,
  enabled: boolean,
  windowRef: Window
): DebugStatus => {
  const storage = getStorage(windowRef);
  if (storage) {
    const key = getDebugStorageKey(channel);
    if (enabled) storage.setItem(key, '1');
    else storage.removeItem(key);
  }
  return getDebugStatus(windowRef);
};

const getDebugStatus = (windowRef: Window): DebugStatus => {
  const entries = DEBUG_CHANNELS.map(
    (channel) => [channel, isDebugChannelEnabled(channel, windowRef)] as const
  );
  return Object.fromEntries(entries) as DebugStatus;
};

export const setDebugSnapshot = (channel: DebugChannel, snapshot: DebugSnapshot): void => {
  snapshots.set(channel, snapshot);
};

export const debugLog = (channel: DebugChannel, message: string, payload?: unknown): void => {
  if (!isDebugChannelEnabled(channel)) return;
  console.log(`[CaramelBoard][${channel}] ${message}`, payload);
};

export const installCaramelDebugConsoleCommands = (windowRef: Window): void => {
  windowRef.CaramelDebug = {
    channels: DEBUG_CHANNELS,
    enable: (channel = DEFAULT_DEBUG_CHANNEL) => setDebugChannelEnabled(channel, true, windowRef),
    disable: (channel = DEFAULT_DEBUG_CHANNEL) => setDebugChannelEnabled(channel, false, windowRef),
    status: () => getDebugStatus(windowRef),
    snapshot: (channel = DEFAULT_DEBUG_CHANNEL) => snapshots.get(channel) ?? null,
  };
};
