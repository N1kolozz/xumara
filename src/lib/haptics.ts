// Best-effort haptic feedback. The Vibration API is Android-only (iOS Safari
// has no support), so this silently no-ops where unavailable.
export const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers throw on vibrate() without a user gesture — ignore.
  }
};
