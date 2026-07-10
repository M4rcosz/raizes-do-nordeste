// Single source of truth for the Jest SWC transform, shared by the unit config
// (package.json "jest") and the e2e config (test/jest-e2e.json). Both reference this
// file so the swc options cannot drift apart. decoratorMetadata stays on because
// @swc/jest, unlike the nest-cli swc builder, does not inject it on its own and Nest
// DI needs it to resolve dependencies in tests.
const { createTransformer } = require('@swc/jest');

module.exports = createTransformer({
  jsc: {
    target: 'es2023',
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
  module: { type: 'commonjs' },
});
