/* ! Modified from John Doherty's MIT-licensed https://github.com/john-doherty/swiped-events */
(() => {
  'use strict';

  const THRESHOLD = 100;
  const TIMEOUT = 500;

  let downX: number | null = null;
  let downY: number | null = null;
  let diffX = 0;
  let diffY = 0;
  let timeDown: number | null = null;
  let startElement: EventTarget | null = null;

  if (typeof window.CustomEvent !== 'function') {
    // @ts-ignore
    window.CustomEvent = (event: string, params: any) => {
      params = params || {bubbles: false, cancelable: false, detail: undefined};
      const e = document.createEvent('CustomEvent');
      e.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
      return e;
    };

    // @ts-ignore
    window.CustomEvent.prototype = window.Event.prototype;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (startElement !== e.target) return;

    const timeDiff = Date.now() - timeDown!;
    let eventType = '';

    if (Math.abs(diffX) > Math.abs(diffY)) {
      if (Math.abs(diffX) > THRESHOLD && timeDiff < TIMEOUT) {
        if (diffX > 0) {
          eventType = 'swiped-left';
        } else {
          eventType = 'swiped-right';
        }
      }
    } else {
      if (Math.abs(diffY) > THRESHOLD && timeDiff < TIMEOUT) {
        if (diffY > 0) {
          eventType = 'swiped-up';
        } else {
          eventType = 'swiped-down';
        }
      }
    }

    if (eventType) {
      startElement!.dispatchEvent(new CustomEvent(eventType, {bubbles: true, cancelable: true}));
    }

    downX = null;
    downY = null;
    timeDown = null;
  }

  function handleTouchStart(e: TouchEvent) {
    startElement = e.target;

    timeDown = Date.now();
    downX = e.touches[0].clientX;
    downY = e.touches[0].clientY;
    diffX = 0;
    diffY = 0;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!downX || !downY) return;
    diffX = downX - e.touches[0].clientX;
    diffY = downY - e.touches[0].clientY;
  }

  document.addEventListener('touchstart', handleTouchStart, false);
  document.addEventListener('touchmove', handleTouchMove, false);
  document.addEventListener('touchend', handleTouchEnd, false);
})();
