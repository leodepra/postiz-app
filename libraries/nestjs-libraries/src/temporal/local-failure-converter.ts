import { DefaultFailureConverter } from '@temporalio/common';
// Workflow-compatible: no crypto or environment access in the workflow isolate.
export const failureConverter = new DefaultFailureConverter({ encodeCommonAttributes: true });
