import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';

const quoteCmdArg = (arg) => {
  if (!isWindows) return arg;
  if (!/[\s"&|<>^]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
};

export const npmArgs = (args) =>
  isWindows ? ['/d', '/s', '/c', ['npm', ...args.map(quoteCmdArg)].join(' ')] : args;

export const spawnNpm = (args, options = {}) =>
  spawn(npmCommand, npmArgs(args), {
    stdio: 'inherit',
    ...options,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });

export const terminateChild = (child, signal = 'SIGTERM') => {
  if (!child.killed) {
    child.kill(signal);
  }
};
