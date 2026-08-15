import { createApplication } from './app/create-application.js';
import { loadConfig } from './app/config.js';

const config = loadConfig(process.env);
const application = createApplication(config);
const server = application.listen(config.port, '0.0.0.0', () => {
  console.log(`API listening on port ${String(config.port)}`);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing the HTTP interface.`);
  server.close((error) => {
    const closeDatabase = application.locals.closeDatabase as (() => Promise<void>) | undefined;
    Promise.resolve(closeDatabase?.())
      .then(() => {
        if (error !== undefined) throw error;
        process.exitCode = 0;
      })
      .catch((reason: unknown) => {
        console.error(reason);
        process.exitCode = 1;
      });
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
