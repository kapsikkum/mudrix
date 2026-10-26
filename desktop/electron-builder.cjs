// electron-builder picks this up first. The settings live in electron-builder.base.yml; this only
// adds the version from the root package.json, the single version for web and desktop.
const { version } = require('../package.json');

module.exports = {
  extends: './electron-builder.base.yml',
  extraMetadata: { version },
};
