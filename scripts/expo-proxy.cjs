// Preserve the managed runtime's HTTP proxy for Expo's WebSocket tunnel.
const Module = require('node:module');
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy) {
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    const result = original.call(this, request, parent, ...rest);
    if (request !== 'ws' || !parent?.filename.includes('@expo/ws-tunnel')) return result;
    class ProxiedWebSocket extends result.WebSocket {
      constructor(address, options) {
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(address).hostname);
        super(address, { ...options, ...(!local ? { agent: new HttpsProxyAgent(proxy) } : {}) });
      }
    }
    return { ...result, WebSocket: ProxiedWebSocket };
  };
}
