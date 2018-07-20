import RSVP from 'rsvp';
import { run } from '@ember/runloop';
import { DEBUG } from '@glimmer/env';
import { registerWaiter } from '@ember/test';

const APP_SCHEDULER_HAS_SETUP = '__APP_SCHEDULER_HAS_SETUP__';
let _didTransition;
let _whenRoutePainted;
let _whenRouteIdle;
let _requestAnimationFrameEnabled;
let _requestIdleCallbackEnabled;
let _activeScheduledTasks = 0;
export const SCHEDULE_TYPE = {
  RAF: 'requestAnimationFrame',
  RIC: 'requestIdleCallback',
};
export const SIMPLE_CALLBACK = callback => callback();

reset();

export function beginTransition() {
  if (_didTransition.isResolved) {
    _didTransition = _defer();
    _whenRoutePainted = _didTransition.promise.then(() =>
      _afterNextPaint(getScheduleFn())
    );
    _whenRouteIdle = _whenRoutePainted.then(() =>
      _afterNextPaint(getScheduleFn(SCHEDULE_TYPE.RIC))
    );
  }
}

export function endTransition() {
  _didTransition.resolve();
}

export function setupRouter(router) {
  if (router[APP_SCHEDULER_HAS_SETUP]) {
    return;
  }

  router[APP_SCHEDULER_HAS_SETUP] = true;
  router.on('willTransition', beginTransition);
  router.on('didTransition', endTransition);
}

export function reset() {
  _didTransition = _defer();
  _whenRoutePainted = _didTransition.promise.then();
  _whenRouteIdle = _whenRoutePainted.then();
  _didTransition.resolve();
  _activeScheduledTasks = 0;
}

/**
 * Top level promise that represents the entry point for deferred work.
 * Subsequent promises are chained off this promise, successively composing
 * them together to approximate when painting has occurred.
 *
 * @public
 */
export function didTransition() {
  return _didTransition.promise;
}

/**
 * This promise, when resolved, approximates after the route is first painted.
 * This can be used to schedule work to occur that is lower priority than initial
 * work (content outside of the viewport, rendering non-critical content).
 *
 * @public
 */
export function whenRoutePainted() {
  return _whenRoutePainted;
}

/**
 * This promise, when resolved, approximates after content is painted.
 *
 * @public
 */
export function whenRouteIdle() {
  return _whenRouteIdle;
}

/**
 * Used for testing
 */
export function routeSettled() {
  return _whenRouteIdle;
}

useRequestAnimationFrame();
export function useRequestAnimationFrame(
  rAFEnabled = typeof requestAnimationFrame === 'function'
) {
  _requestAnimationFrameEnabled = rAFEnabled;
}

_requestIdleCallbackEnabled = useRequestIdleCallback();
export function useRequestIdleCallback(
  rICEnabled = typeof requestIdleCallback === 'function'
) {
  _requestIdleCallbackEnabled = rICEnabled;
}

function _afterNextPaint(scheduleFn) {
  let promise = new RSVP.Promise(resolve => {
    if (DEBUG) {
      _activeScheduledTasks++;
    }

    scheduleFn(() => {
      run.later(resolve, 0);
    });
  });

  if (DEBUG) {
    promise = promise.finally(() => {
      _activeScheduledTasks--;
    });
  }

  return promise;
}

if (DEBUG) {
  // wait until no active rafs
  registerWaiter(() => _activeScheduledTasks === 0);
}

export function getScheduleFn(scheduleType) {
  if (scheduleType == SCHEDULE_TYPE.RIC && _requestIdleCallbackEnabled) {
    return requestIdleCallback;
  } else if (_requestAnimationFrameEnabled) {
    return requestAnimationFrame;
  } else {
    return SIMPLE_CALLBACK;
  }
}

function _defer(label) {
  let deferred = { resolve: undefined, reject: undefined };

  deferred.isResolved = false;
  deferred.promise = new RSVP.Promise((resolve, reject) => {
    deferred.resolve = () => {
      deferred.isResolved = true;
      return resolve();
    };
    deferred.reject = reject;
  }, label);

  return deferred;
}
