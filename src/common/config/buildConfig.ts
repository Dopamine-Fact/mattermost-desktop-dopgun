// Copyright (c) 2015-2016 Yuya Ochiai
// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {BuildConfig} from 'types/config';

// For detailed guides, please refer to https://docs.mattermost.com/deployment/desktop-app-deployment.html

/**
 * Build-time configuration. End-users can't change these parameters.
 * @prop {Object[]} defaultServers
 * @prop {string} defaultServers[].name - The view name for default server.
 * @prop {string} defaultServers[].url - The URL for default server.
 * @prop {string} defaultServers[].order - Sort order for server views (0, 1, 2)
 * @prop {string} helpLink - The URL for "Help->Learn More..." menu item.
 *                           If null is specified, the menu disappears.
 * @prop {boolean} enableServerManagement - Whether users can edit servers configuration.
 *                                          Specify at least one server for "defaultServers"
 *                                          when "enableServerManagement is set to false
 * @prop {[]} managedResources - Defines which paths are managed
 * @prop {[]} allowedProtocols - Defines which protocols should be automatically allowed
 * @prop {[]} trustedEmbeddedMediaOrigins - Explicit origin pairs that may share media permissions for embedded content
 */
const buildConfig: BuildConfig = {
    defaultServers: [
        {
            name: 'Dopamine Fact',
            url: 'https://todo.dopaminefact.com',
        },
    ],
    helpLink: '',
    academyLink: '',
    upgradeLink: '',
    enableServerManagement: false,
    enableUpdateNotifications: false, // would offer official Mattermost releases
    updateNotificationURL: 'https://releases.mattermost.com/desktop',
    macAppStoreUpdateURL: 'macappstore://apps.apple.com/us/app/mattermost-desktop/id1614666244',
    windowsStoreUpdateURL: 'ms-windows-store://pdp/?productid=XP8BR8MH3LPKLT',
    linuxUpdateURL: 'https://docs.mattermost.com/deployment-guide/desktop/linux-desktop-install.html',
    linuxGitHubReleaseURL: 'https://github.com/mattermost/desktop/releases/tag',
    managedResources: ['trusted'],
    allowedProtocols: [
        'mattermost',
        'ftp',
        'mailto',
        'tel',
    ],
    trustedEmbeddedMediaOrigins: [],
};

export default buildConfig;
