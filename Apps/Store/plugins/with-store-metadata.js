const { withInfoPlist } = require('expo/config-plugins');
module.exports = (config, { category }) => withInfoPlist(config, c => {
  c.modResults.LSApplicationCategoryType = category;
  c.modResults.NSHumanReadableCopyright = 'Copyright © 2026 Max Miller';
  return c;
});
