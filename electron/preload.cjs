const { contextBridge, ipcRenderer } = require('electron');
const methods = [
  'snapshot',
  'setTheme',
  'saveProject',
  'updateVersion',
  'removeProject',
  'saveSettings',
  'authenticate',
  'apps',
  'history',
  'inspect',
  'prepare',
  'publish',
  'reconcile',
  'discard',
  'pickDirectory',
  'pickFile',
  'openTaskFolder',
  'buildAndroidPackage',
  'listAndroidDevices',
  'installAndroidApk',
  'importAndroidApk',
  'openAndroidPackageFolder',
];
const api = Object.fromEntries(
  methods.map((name) => [name, (arg) => ipcRenderer.invoke('pushdesk:' + name, arg)]),
);
api.onEvent = (callback) => {
  const listener = (_e, data) => callback(data);
  ipcRenderer.on('pushdesk:event', listener);
  return () => ipcRenderer.removeListener('pushdesk:event', listener);
};
contextBridge.exposeInMainWorld('pushdesk', Object.freeze(api));
