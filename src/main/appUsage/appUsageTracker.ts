// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type ForegroundWindow = {app: string; title: string};
export type AppUsageInterval = {app: string; title: string; start_at: number; end_at: number};

type Deps = {
    now: () => number;
    idleSeconds: () => number;
    sample: () => ForegroundWindow | undefined;
    serverIds: () => string[];
};

const TICK_MS = 5000;
const CUT_MS = 60 * 1000;
const GAP_MS = 15 * 1000; // a longer silence between ticks means the machine slept or the app hung
const IDLE_SECONDS = 60;

// shortcut: queues live in memory and are lost when the app quits; persist them if that loss matters.
const KEEP_MS = 24 * 60 * 60 * 1000;

/** Records which window is focused while the user is active, as intervals queued per server for the webapp to pull. */
export class AppUsageTracker {
    private open?: {app: string; title: string; start_at: number};
    private lastTick?: number;
    private queues = new Map<string, AppUsageInterval[]>();
    private timers: NodeJS.Timeout[] = [];
    private deps: Deps;

    constructor(deps: Deps) {
        this.deps = deps;
    }

    tick() {
        const t = this.deps.now();
        this.closeAfterGap(t);
        this.lastTick = t;

        const idle = this.deps.idleSeconds();
        if (idle >= IDLE_SECONDS) {
            this.close(t - (idle * 1000));
            return;
        }
        const win = this.deps.sample();
        if (win && this.open && win.app === this.open.app && win.title === this.open.title) {
            return;
        }
        this.close(t);
        if (win) {
            this.open = {app: win.app, title: win.title, start_at: t};
        }
    }

    // Cuts the open interval at the last input so no finished piece is much longer than a minute
    // and an idle lead-in in progress is never credited.
    cut() {
        const t = this.deps.now();
        this.closeAfterGap(t);
        const open = this.open;
        if (!open) {
            return;
        }
        const idle = this.deps.idleSeconds();
        const end = Math.max(open.start_at, t - (idle * 1000));
        this.close(end);
        if (idle < IDLE_SECONDS) {
            this.open = {...open, start_at: end};
        }
    }

    drain(serverId: string): AppUsageInterval[] {
        const queue = this.trim(this.queues.get(serverId) ?? [], this.deps.now());
        this.queues.delete(serverId);
        return queue;
    }

    start() {
        this.stop();
        this.timers = [setInterval(() => this.tick(), TICK_MS), setInterval(() => this.cut(), CUT_MS)];
    }

    stop() {
        this.timers.forEach((timer) => clearInterval(timer));
        this.timers = [];
    }

    private closeAfterGap(t: number) {
        if (this.lastTick !== undefined && t - this.lastTick > GAP_MS) {
            this.close(this.lastTick);
        }
    }

    private close(end: number) {
        const open = this.open;
        this.open = undefined;
        if (!open || end <= open.start_at) {
            return;
        }
        const interval = {...open, end_at: end};
        this.deps.serverIds().forEach((id) => {
            this.queues.set(id, this.trim([...(this.queues.get(id) ?? []), interval], end));
        });
    }

    private trim(queue: AppUsageInterval[], now: number) {
        return queue.filter((i) => i.end_at >= now - KEEP_MS);
    }
}
