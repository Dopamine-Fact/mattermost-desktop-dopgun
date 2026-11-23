// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import logo from 'assets/logo.png';

type Props = {
    width?: number;
    height?: number;
}

export default ({
    width = 170,
    height = 28,
}: Props) => (
    <span style={{display: 'inline-flex', alignItems: 'center', gap: 8, width, height, color: 'var(--center-channel-color)', fontSize: height * 0.64, fontWeight: 600, whiteSpace: 'nowrap'}}>
        <img
            src={logo}
            alt=''
            height={height}
            width={height}
        />
        {'Dopamine Fact'}
    </span>
);
