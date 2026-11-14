const path = require('node:path');
const { compileModsAsync } = require('expo/config-plugins');
const root = path.resolve(__dirname, '..');
const base = require('../app.json').expo;
const config = require('../plugins/with-store-metadata')(base, { category: 'public.app-category.education' });
compileModsAsync(config, { projectRoot: root, platforms: ['ios'], assertMissingModProviders: true }).catch(error => { console.error(error.message); process.exitCode = 1; });
