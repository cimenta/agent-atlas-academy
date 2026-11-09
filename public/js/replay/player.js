export const SPEEDS = [0.25, 0.5, 1, 2];

const validSpeed = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

export function createPlayer({ events, clock, maxGapMs = 2000, speeds = SPEEDS, speed = 1, timeScale = 1 }) {
  const scale = validSpeed(timeScale) ? timeScale : 1;
  let cursor = 0;
  let playing = false;
  let currentSpeed = validSpeed(speed) ? speed : 1;
  let timer = null;
  const listeners = new Set();

  const isFinished = () => events.length > 0 && cursor >= events.length;
  const notify = () => listeners.forEach((listener) => listener(player));

  function clearTimer() {
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  }

  function stop() {
    playing = false;
    clearTimer();
  }

  function gapBefore(index) {
    if (index <= 0) return 0;
    const gap = events[index].t - events[index - 1].t;
    return Number.isFinite(gap) && gap > 0 ? gap : 0;
  }

  function schedule() {
    clearTimer();
    if (!playing) return;
    if (cursor >= events.length) {
      playing = false;
      return;
    }
    timer = clock.setTimeout(step, Math.min(gapBefore(cursor), maxGapMs) / (currentSpeed * scale));
  }

  function step() {
    timer = null;
    cursor += 1;
    if (cursor >= events.length) playing = false;
    else schedule();
    notify();
  }

  const player = {
    speeds,
    get cursor() {
      return cursor;
    },
    get playing() {
      return playing;
    },
    get speed() {
      return currentSpeed;
    },
    get finished() {
      return isFinished();
    },
    play() {
      if (events.length === 0) return;
      if (isFinished()) cursor = 0;
      playing = true;
      if (cursor === 0) cursor = 1;
      if (cursor >= events.length) playing = false;
      schedule();
      notify();
    },
    pause() {
      stop();
      notify();
    },
    setSpeed(x) {
      if (!validSpeed(x)) return;
      currentSpeed = x;
      schedule();
      notify();
    },
    next() {
      stop();
      if (cursor < events.length) cursor += 1;
      notify();
    },
    prev() {
      stop();
      if (cursor > 0) cursor -= 1;
      notify();
    },
    seek(target) {
      const n = Math.floor(Number(target));
      if (!Number.isFinite(n)) return;
      cursor = Math.max(0, Math.min(events.length, n));
      if (playing && isFinished()) playing = false;
      schedule();
      notify();
    },
    restart() {
      stop();
      cursor = 0;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return player;
}
