const { proxyActivities } = require('@temporalio/workflow');
const { echo } = proxyActivities({ startToCloseTimeout: '10s' });
exports.encryptedProbe = async (value) => echo(value);
