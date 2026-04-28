const nonPassiveCaptureOptions: AddEventListenerOptions = {
  capture: true,
  passive: false,
};

export function installViewportZoomLock() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  let lastTouchEnd = 0;

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("input, textarea, select, button, a, [role='button'], [contenteditable='true']"));
  };

  const preventDefault = (event: Event) => {
    if (event.cancelable) {
      event.preventDefault();
    }
  };

  const preventMultiTouch = (event: TouchEvent) => {
    if (event.touches.length > 1 && event.cancelable) {
      event.preventDefault();
    }
  };

  const preventDoubleTapZoom = (event: TouchEvent) => {
    if (isInteractiveTarget(event.target)) {
      lastTouchEnd = Date.now();
      return;
    }

    const now = Date.now();

    if (now - lastTouchEnd <= 300 && event.cancelable) {
      event.preventDefault();
    }

    lastTouchEnd = now;
  };

  const preventTrackpadZoom = (event: WheelEvent) => {
    if (event.ctrlKey && event.cancelable) {
      event.preventDefault();
    }
  };

  const touchTargets: EventTarget[] = [
    window,
    document,
    document.documentElement,
    document.body,
    document.getElementById("root"),
  ].filter(Boolean) as EventTarget[];

  window.addEventListener("gesturestart", preventDefault, nonPassiveCaptureOptions);
  window.addEventListener("gesturechange", preventDefault, nonPassiveCaptureOptions);
  window.addEventListener("gestureend", preventDefault, nonPassiveCaptureOptions);
  document.addEventListener("gesturestart", preventDefault, nonPassiveCaptureOptions);
  document.addEventListener("gesturechange", preventDefault, nonPassiveCaptureOptions);
  document.addEventListener("gestureend", preventDefault, nonPassiveCaptureOptions);
  window.addEventListener("wheel", preventTrackpadZoom, nonPassiveCaptureOptions);

  touchTargets.forEach((target) => {
    target.addEventListener("touchstart", preventMultiTouch as EventListener, nonPassiveCaptureOptions);
    target.addEventListener("touchmove", preventMultiTouch as EventListener, nonPassiveCaptureOptions);
    target.addEventListener("touchend", preventDoubleTapZoom as EventListener, nonPassiveCaptureOptions);
  });
}
