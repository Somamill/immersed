const { withXcodeProject, withInfoPlist } = require('expo/config-plugins');

module.exports = function withStoreSigning(config, { profileName }) {
  config = withInfoPlist(config, c => {
    c.modResults.CFBundleName = config.name;
    return c;
  });
  return withXcodeProject(config, c => {
    for (const entry of Object.values(c.modResults.pbxXCBuildConfigurationSection())) {
      if (!entry || typeof entry !== 'object' || !entry.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER || !['Release', '"Release"'].includes(entry.name)) continue;
      Object.assign(entry.buildSettings, {
        '"CODE_SIGN_STYLE[sdk=iphoneos*]"': 'Manual',
        '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"': '"Apple Distribution"',
        '"PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]"': JSON.stringify(profileName),
      });
    }
    return c;
  });
};
