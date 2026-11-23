// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ForegroundWindow} from './appUsageTracker';
import {AppUsageTracker} from './appUsageTracker';

const HOUR = 3600 * 1000;

function setup() {
    let t = 0;
    let idle = 0;
    let win: ForegroundWindow | undefined = {app: 'chrome', title: 'A'};
    const tracker = new AppUsageTracker({
        now: () => t,
        idleSeconds: () => idle,
        sample: () => win,
        serverIds: () => ['s1', 's2'],
    });
    const at = (time: number, opts: {idle?: number; win?: ForegroundWindow | undefined} = {}) => {
        t = time;
        idle = opts.idle ?? 0;
        if ('win' in opts) {
            win = opts.win;
        }
        tracker.tick();
    };
    const cutAt = (time: number, cutIdle = idle) => {
        t = time;
        idle = cutIdle;
        tracker.cut();
    };
    const every5s = (from: number, to: number) => {
        for (let time = from; time <= to; time += 5000) {
            at(time);
        }
    };
    return {tracker, at, cutAt, every5s};
}

const chrome = (startAt: number, endAt: number) => ({app: 'chrome', title: 'A', start_at: startAt, end_at: endAt});

describe('AppUsageTracker', () => {
    it('extends the open interval while the same window stays focused', () => {
        const {tracker, at, cutAt} = setup();
        at(0);
        at(5000);
        at(10000);
        cutAt(10000);
        expect(tracker.drain('s1')).toEqual([chrome(0, 10000)]);
    });

    it('closes at the sample time when the window changes', () => {
        const {tracker, at, cutAt} = setup();
        at(0);
        at(5000);
        at(10000, {win: {app: 'Photoshop', title: 'x'}});
        cutAt(15000);
        expect(tracker.drain('s1')).toEqual([chrome(0, 10000), {app: 'Photoshop', title: 'x', start_at: 10000, end_at: 15000}]);
    });

    it('trims the idle lead-in', () => {
        const {tracker, at, cutAt, every5s} = setup();
        every5s(0, 30000);
        for (let time = 35000, idle = 5; time <= 95000; time += 5000, idle += 5) {
            at(time, {idle});
        }
        cutAt(95000);
        expect(tracker.drain('s1')).toEqual([chrome(0, 30000)]);
    });

    it('a cut during the idle lead-in does not credit it', () => {
        const {tracker, at, cutAt, every5s} = setup();
        every5s(0, 30000);
        for (let time = 35000, idle = 5; time <= 55000; time += 5000, idle += 5) {
            at(time, {idle});
        }
        cutAt(60000, 30);
        for (let time = 65000, idle = 35; time <= 95000; time += 5000, idle += 5) {
            at(time, {idle});
        }
        cutAt(95000);
        expect(tracker.drain('s1')).toEqual([chrome(0, 30000)]);
    });

    it('closes at the previous tick after a gap longer than 15 s', () => {
        const {tracker, at, cutAt} = setup();
        at(0);
        at(5000);
        at(600000);
        at(605000);
        cutAt(605000);
        expect(tracker.drain('s1')).toEqual([chrome(0, 5000), chrome(600000, 605000)]);
    });

    it('does not credit a gap to a cut that runs before the next tick', () => {
        const {tracker, at, cutAt} = setup();
        at(0);
        at(5000);
        cutAt(HOUR);
        expect(tracker.drain('s1')).toEqual([chrome(0, 5000)]);
    });

    it('cut splits the open interval and keeps recording', () => {
        const {tracker, cutAt, every5s} = setup();
        every5s(0, 60000);
        cutAt(60000);
        every5s(65000, 120000);
        cutAt(120000);
        expect(tracker.drain('s1')).toEqual([chrome(0, 60000), chrome(60000, 120000)]);
    });

    it('each server drains its own copy once', () => {
        const {tracker, at, cutAt} = setup();
        at(0);
        at(5000);
        cutAt(5000);
        expect(tracker.drain('s1')).toEqual([chrome(0, 5000)]);
        expect(tracker.drain('s2')).toEqual([chrome(0, 5000)]);
        expect(tracker.drain('s1')).toEqual([]);
        expect(tracker.drain('unknown')).toEqual([]);
    });

    it('keeps only the last 24 hours per server', () => {
        const {tracker, at, cutAt} = setup();
        at(0);
        at(5000);
        cutAt(5000);
        cutAt(5000 + (25 * HOUR));
        expect(tracker.drain('s1')).toEqual([]);
    });

    it('records nothing when there is no foreground window', () => {
        const {tracker, at, cutAt} = setup();
        at(0, {win: undefined});
        at(5000);
        cutAt(5000);
        expect(tracker.drain('s1')).toEqual([]);
    });
});
