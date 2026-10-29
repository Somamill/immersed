const { getDefaultConfig } = require('expo/metro-config');
const withImmersionApi = require('./server/middleware.cjs');
const config = getDefaultConfig(__dirname);
config.server.enhanceMiddleware = middleware => withImmersionApi(middleware);
module.exports = config;
