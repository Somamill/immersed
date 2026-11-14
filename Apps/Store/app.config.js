module.exports = ({ config }) => ({
  ...config,
  ios: { ...config.ios, buildNumber: process.env.DOT_BUILD_NUMBER || config.ios?.buildNumber || '1' },
  updates: { enabled: false },
  plugins: [...(config.plugins || []), ['./plugins/with-store-signing', { profileName: 'dot immersed IOS_APP_STORE' }], ...(process.env.DOT_PLATFORM === 'macos' ? ['./plugins/with-mac-catalyst'] : [])],
});
