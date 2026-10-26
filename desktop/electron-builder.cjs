const { version } = require('../package.json');

module.exports = {
  extends: './electron-builder.base.yml',
  extraMetadata: { version },
};
