// @flow
import React from 'react';

import { formatExampleMessage } from './message.js';

export const output: string = formatExampleMessage({ name: 'FFT' });
export const rendered: React.Node = <main>{output}</main>;
