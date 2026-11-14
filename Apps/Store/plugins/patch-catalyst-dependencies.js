const fs = require('node:fs');
const path = require('node:path');
// Reanimated 4.7.1 imports both frameworks on Catalyst, making Rect/Point ambiguous.
// Match its existing UIKit-first function implementation. Upstream issue:
// https://github.com/software-mansion/react-native-reanimated/issues/10908
module.exports = function patchCatalystDependencies(projectRoot) {
  const pkg = require.resolve('react-native-reanimated/package.json', { paths: [projectRoot] });
  const header = path.join(path.dirname(pkg), 'apple/reanimated/apple/REAReducedMotion.h');
  const original = '#import <UIKit/UIAccessibility.h>\n#endif\n\n#if __has_include(<AppKit/AppKit.h>)\n#import <AppKit/AppKit.h>';
  const fixed = '#import <UIKit/UIAccessibility.h>\n#else\n#import <AppKit/AppKit.h>';
  const text = fs.readFileSync(header, 'utf8');
  if (text.includes(fixed)) return;
  if (!text.includes(original)) throw new Error('Reanimated reduced-motion header changed; review the Catalyst patch before building.');
  fs.writeFileSync(header, text.replace(original, fixed));
};
