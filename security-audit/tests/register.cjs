// Execute the actual TypeScript modules without starting Nest or any services.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) {
  for (const [prefix, dir] of Object.entries({
    '@gitroom/helpers/': 'libraries/helpers/src/',
    '@gitroom/nestjs-libraries/': 'libraries/nestjs-libraries/src/',
  })) if (name.startsWith(prefix)) name = path.join(root, dir, name.slice(prefix.length));
  return resolve.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = function (module, file) {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true, experimentalDecorators: true },
  });
  module._compile(outputText, file);
};
