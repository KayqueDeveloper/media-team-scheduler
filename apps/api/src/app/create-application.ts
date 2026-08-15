import type { Express } from 'express';

import { createApp as createLegacyApplication } from '../../../../server/index.js';

import type { ApiConfig } from './config.js';

export function createApplication(config: ApiConfig): Express {
  return createLegacyApplication({
    timeZone: config.timeZone,
    publicAppUrl: config.publicAppUrl,
    ...(config.confirmationTokenSecret === null
      ? {}
      : { confirmationTokenSecret: config.confirmationTokenSecret })
  });
}
