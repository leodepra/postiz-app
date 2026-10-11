// Diagnostic module names only; never records arguments, exports or environment.
const Module = require('node:module');
const original = Module._load;
let last = 0;
Module._load = function (name, ...rest) {
  if (Date.now() - last > 1000) {
    last = Date.now();
    process.stderr.write('STARTUP_MODULE ' + String(name).replace(/[\r\n]/g, '') + '\n');
  }
  return original.call(this, name, ...rest);
};
