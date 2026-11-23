// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ForegroundWindow} from './appUsageTracker';

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const MAX_PATH_CHARS = 32768;

type Bindings = {
    getForegroundWindow: () => unknown;
    getWindowTextLengthW: (hwnd: unknown) => number;
    getWindowTextW: (hwnd: unknown, buf: Buffer, max: number) => number;
    getWindowThreadProcessId: (hwnd: unknown, pid: number[]) => number;
    openProcess: (access: number, inherit: boolean, pid: number) => unknown;
    queryFullProcessImageNameW: (handle: unknown, flags: number, buf: Buffer, size: number[]) => boolean;
    closeHandle: (handle: unknown) => boolean;
};

let bindings: Bindings | undefined;

function load(): Bindings {
    if (!bindings) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const koffi = require('koffi');
        const user32 = koffi.load('user32.dll');
        const kernel32 = koffi.load('kernel32.dll');
        bindings = {
            getForegroundWindow: user32.func('void *GetForegroundWindow()'),
            getWindowTextLengthW: user32.func('int GetWindowTextLengthW(void *hWnd)'),
            getWindowTextW: user32.func('int GetWindowTextW(void *hWnd, _Out_ uint16 *lpString, int nMaxCount)'),
            getWindowThreadProcessId: user32.func('uint32 GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)'),
            openProcess: kernel32.func('void *OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'),
            queryFullProcessImageNameW: kernel32.func('bool QueryFullProcessImageNameW(void *hProcess, uint32 dwFlags, _Out_ uint16 *lpExeName, _Inout_ uint32 *lpdwSize)'),
            closeHandle: kernel32.func('bool CloseHandle(void *hObject)'),
        };
    }
    return bindings;
}

function decode(buf: Buffer, chars: number) {
    return buf.toString('utf16le', 0, chars * 2);
}

/** The focused window's application (exe name without .exe) and title; Windows only, never throws. */
export function getForegroundWindow(): ForegroundWindow | undefined {
    if (process.platform !== 'win32') {
        return undefined;
    }
    try {
        const api = load();
        const hwnd = api.getForegroundWindow();
        if (!hwnd) {
            return undefined;
        }

        const titleLength = api.getWindowTextLengthW(hwnd);
        const titleBuf = Buffer.alloc((titleLength + 1) * 2);
        const title = decode(titleBuf, api.getWindowTextW(hwnd, titleBuf, titleLength + 1));

        const pid = [0];
        api.getWindowThreadProcessId(hwnd, pid);
        const handle = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
        if (!handle) {
            return undefined;
        }
        try {
            const pathBuf = Buffer.alloc(MAX_PATH_CHARS * 2);
            const size = [MAX_PATH_CHARS];
            if (!api.queryFullProcessImageNameW(handle, 0, pathBuf, size)) {
                return undefined;
            }
            const app = decode(pathBuf, size[0]).split(/[\\/]/).pop()!.replace(/\.exe$/i, '');
            return app ? {app, title} : undefined;
        } finally {
            api.closeHandle(handle);
        }
    } catch {
        return undefined;
    }
}
