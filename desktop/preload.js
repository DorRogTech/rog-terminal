const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('rogTerminal', {
  platform: process.platform,
  isDesktop: true,
  version: require('./package.json').version,
});
