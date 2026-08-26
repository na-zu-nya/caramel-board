export interface ViewerStackNavigationOptions {
  history?: 'push' | 'replace';
}

export type ViewerStackNavigator = (
  stackId: string,
  options?: ViewerStackNavigationOptions
) => void | Promise<void>;

export function shouldReplaceViewerHistory(options?: ViewerStackNavigationOptions): boolean {
  return options?.history !== 'push';
}

export async function commitShuffleNavigation(input: {
  stackId: string;
  onNavigateStack?: ViewerStackNavigator;
  navigateRoute: () => void | Promise<void>;
}): Promise<void> {
  if (input.onNavigateStack) {
    await input.onNavigateStack(input.stackId, { history: 'push' });
    return;
  }

  await input.navigateRoute();
}
