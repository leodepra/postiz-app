import { TemporalModule, TEMPORAL_CLIENT } from 'nestjs-temporal-core';
import { Client } from '@temporalio/client';
import { localTemporalDataConverter } from './local-payload-codec';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { emailQueues } from '@gitroom/nestjs-libraries/temporal/email.queues';

export const getTemporalModule = (
  isWorkers: boolean,
  path?: string,
  activityClasses?: any[]
) => {
  // Queues this worker server should NOT run, comma-separated
  // (e.g. EXCLUDE_QUEUE="reddit,x,twitch"). Use it to pin a queue to a single
  // server: exclude it on every server except the one that should own it.
  // Meant for the providers whose concurrency is too low to split (limit 1).
  const excludeQueues = (process.env.EXCLUDE_QUEUE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // How many worker servers share each (non-excluded) queue. Per-server
  // concurrency is divided by this so the GLOBAL concurrency stays correct.
  // 1 server => 1 (full), 2 servers => 2 (half each), 3 servers => 3, etc.
  const divider = Math.max(
    1,
    Number(process.env.WORKER_CONCURRENCY_DIVIDER) || 1
  );

  const module = TemporalModule.register({
    isGlobal: true,
    connection: {
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
      ...(process.env.TEMPORAL_API_KEY
        ? { apiKey: process.env.TEMPORAL_API_KEY }
        : {}),
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    },
    taskQueue: 'main',
    logLevel: 'error',
    ...(isWorkers
      ? {
          workers: [
            ...[
              { identifier: 'main', maxConcurrentJob: undefined },
              ...socialIntegrationList,
            ]
              .filter((f) => f.identifier.indexOf('-') === -1)
              .map((integration) => ({
                integration,
                taskQueue: integration.identifier.split('-')[0],
              }))
              .filter(({ taskQueue }) => !excludeQueues.includes(taskQueue))
              .map(({ integration, taskQueue }) => {
                // Split the per-provider cap across the servers sharing this
                // queue. Floor (never below 1) so the global total never exceeds
                // the provider's limit. Providers whose limit is smaller than the
                // server count must be pinned via EXCLUDE_QUEUE instead.
                const concurrency = integration.maxConcurrentJob
                  ? Math.max(
                      1,
                      Math.floor(integration.maxConcurrentJob / divider)
                    )
                  : undefined;

                // Workflows only ever run on the `main` queue; the other Workers
                // are activity-only, so skip the workflow bundle (webpack build,
                // workflow thread + V8 isolate, sticky cache) on them.
                return {
                  taskQueue,
                  ...(taskQueue === 'main' ? { workflowsPath: path! } : {}),
                  activityClasses: activityClasses!,
                  autoStart: true,
                  workerOptions: {
                    ...(process.env.POSTIZ_LOCAL_ONLY === 'true' ? { dataConverter: { ...localTemporalDataConverter() } } : {}),
                    maxConcurrentActivityTaskExecutions: process.env.POSTIZ_LOCAL_ONLY === 'true' ? Math.min(concurrency || 4, 4) : concurrency || 1000000,
                    // By default the SDK throttles heartbeat sends to 60s, so
                    // against the workflow's heartbeatTimeout one dropped send
                    // or a minute of event-loop lag eats most of the margin.
                    // Sending every 15s keeps the recorded heartbeat fresh even
                    // when individual sends fail or fire late.
                    maxHeartbeatThrottleInterval: '15s',
                  },
                };
              }),
            // Activity-only Workers for emails, rate limited server side
            // across all workers to stay under the Resend limit
            ...Object.values(emailQueues)
              .filter(() => process.env.POSTIZ_LOCAL_ONLY !== 'true')
              .filter(({ taskQueue }) => !excludeQueues.includes(taskQueue))
              .map(({ taskQueue, perSecond }) => ({
                taskQueue,
                activityClasses: activityClasses!,
                autoStart: true,
                workerOptions: {
                  maxConcurrentActivityTaskExecutions: 10,
                  maxTaskQueueActivitiesPerSecond: perSecond,
                },
              })),
          ],
        }
      : {}),
  });
  if (process.env.POSTIZ_LOCAL_ONLY === 'true') {
    // The integration library exposes a client provider but omits dataConverter
    // in its options. Wrap that provider so client and workers use the same codec.
    module.providers = module.providers!.map((provider: any) => provider.provide !== TEMPORAL_CLIENT ? provider : {
      ...provider,
      useFactory: async (...args: any[]) => {
        const client = await provider.useFactory(...args);
        if (!client) throw new Error('Local Temporal connection required');
        return new Client({ connection: client.connection, namespace: process.env.TEMPORAL_NAMESPACE || 'default', dataConverter: localTemporalDataConverter() });
      },
    });
  }
  return module;
};
