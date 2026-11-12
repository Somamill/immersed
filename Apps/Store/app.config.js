module.exports = ({ config }) => ({ ...config, plugins: [...(config.plugins || []), ...(process.env.DOT_PLATFORM === 'macos' ? ['./plugins/with-mac-catalyst'] : [])] });
