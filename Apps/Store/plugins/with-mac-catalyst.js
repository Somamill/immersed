// CNG only: make Mac Catalyst a distinct, sandboxed Store build.
const { withPodfile, withPodfileProperties, withXcodeProject, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
module.exports = function withMacCatalyst(config) {
  config = require('./with-store-metadata')(config, { category: 'public.app-category.education' });
  config = withPodfileProperties(config, c => {
    // Expo and React Native prebuilt iOS frameworks may omit Catalyst slices.
    c.modResults['ios.buildReactNativeFromSource'] = 'true';
    c.modResults['ios.usePrecompiledModules'] = 'false';
    return c;
  });
  config = withPodfile(config, c => {
    const text = c.modResults.contents;
    if (!text.includes(':mac_catalyst_enabled => false') && !text.includes(':mac_catalyst_enabled => true')) throw new Error('Expo Podfile changed: review Catalyst integration before building.');
    c.modResults.contents = text.replace(':mac_catalyst_enabled => false', ':mac_catalyst_enabled => true');
    return c;
  });
  config = withDangerousMod(config, ['ios', c => {
    require('./patch-catalyst-dependencies')(c.modRequest.projectRoot);
    fs.writeFileSync(path.join(c.modRequest.platformProjectRoot, 'StoreMac.entitlements'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.app-sandbox</key><true/><key>com.apple.security.network.client</key><true/><key>com.apple.security.files.user-selected.read-write</key><true/></dict></plist>\n`);
    return c;
  }]);
  return withXcodeProject(config, c => {
    const section = c.modResults.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(section)) {
      if (!entry || typeof entry !== 'object' || !entry.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER) continue;
      Object.assign(entry.buildSettings, {
        SUPPORTS_MACCATALYST: 'YES',
        '"CODE_SIGN_STYLE[sdk=macosx*]"': 'Manual',
        '"CODE_SIGN_IDENTITY[sdk=macosx*]"': '"Apple Distribution"',
        '"PROVISIONING_PROFILE_SPECIFIER[sdk=macosx*]"': '"dot immersed MAC_CATALYST_APP_STORE"',
        DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER: 'NO',
        SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: 'NO',
        '"CODE_SIGN_ENTITLEMENTS[sdk=macosx*]"': 'StoreMac.entitlements',
        '"ENABLE_APP_SANDBOX[sdk=macosx*]"': 'YES',
        '"ENABLE_HARDENED_RUNTIME[sdk=macosx*]"': 'YES',
      });
    }
    return c;
  });
};
