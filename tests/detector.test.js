const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAll } = require('./helper');
loadAll();

const detect = VSG.detector.detectPageState;

test('detects Cloudflare challenge', () => {
  assert.equal(detect({ url: 'https://www.usvisascheduling.com/', title: 'Just a moment...', bodyText: 'Verifying you are human. This may take a few seconds.' }), 'CHALLENGE');
});

test('detects waiting room', () => {
  assert.equal(detect({ url: 'https://www.usvisascheduling.com/', title: 'Waiting', bodyText: 'You are in a waiting room. Estimated wait time: 5 minutes.' }), 'QUEUE');
});

test('detects rate limiting', () => {
  assert.equal(detect({ url: 'https://www.usvisascheduling.com/', title: 'Error', bodyText: 'Too many requests. Please slow down and try again in a few minutes.' }), 'RATE_LIMITED');
});

test('detects expired session', () => {
  assert.equal(detect({ url: 'https://www.usvisascheduling.com/schedule', title: 'Schedule', bodyText: 'Your session has expired. Please log in again.' }), 'SESSION_EXPIRED');
});

test('detects login page', () => {
  assert.equal(detect({ url: 'https://www.usvisascheduling.com/login', title: 'Sign in', bodyText: 'Sign in to your account. Username Password Forgot your password?' }), 'LOGGED_OUT');
});

test('detects ready calendar (text markers)', () => {
  assert.equal(detect({ url: 'https://www.usvisascheduling.com/schedule', title: 'Schedule Appointment', bodyText: 'Appointment calendar — select a date. Available dates are highlighted.' }), 'READY_CALENDAR');
});

test('detects ready calendar (data attributes)', () => {
  assert.equal(detect({ url: 'https://x/', title: '', bodyText: 'pick one', html: '<td data-available-date="2026-11-05">5</td>' }), 'READY_CALENDAR');
});

test('calendar wins over stray sign-in link', () => {
  assert.equal(detect({ url: 'https://www.usvisascheduling.com/schedule', title: 'Schedule', bodyText: 'Appointment calendar. Sign in link in footer.' }), 'READY_CALENDAR');
});

test('unknown page stays unknown', () => {
  assert.equal(detect({ url: 'https://www.usvisascheduling.com/', title: '', bodyText: 'welcome' }), 'UNKNOWN');
});
