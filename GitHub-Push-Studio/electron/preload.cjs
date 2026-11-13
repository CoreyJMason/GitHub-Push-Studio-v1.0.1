const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('studio', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  refresh: () => ipcRenderer.invoke('refresh'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  openRecent: path => ipcRenderer.invoke('open-recent', path),
  initialize: () => ipcRenderer.invoke('initialize'),
  addIgnore: () => ipcRenderer.invoke('ignore'),
  saveIdentity: payload => ipcRenderer.invoke('identity', payload),
  createRepo: payload => ipcRenderer.invoke('create-repo', payload),
  connectRemote: payload => ipcRenderer.invoke('connect-remote', payload),
  commit: message => ipcRenderer.invoke('commit', message),
  push: () => ipcRenderer.invoke('push'),
  commitAndPush: message => ipcRenderer.invoke('commit-push', message),
  signIn: () => ipcRenderer.invoke('signin'),
  configureGit: () => ipcRenderer.invoke('setup-git'),
  cancelSignIn: () => ipcRenderer.invoke('cancel-signin'),
  install: tool => ipcRenderer.invoke('install', tool),
  doctor: () => ipcRenderer.invoke('doctor'),
  showFolder: () => ipcRenderer.invoke('show-folder'),
  openUrl: key => ipcRenderer.invoke('open-url', key),
  onEvent: callback => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('studio:event', listener)
    return () => ipcRenderer.removeListener('studio:event', listener)
  }
}))
