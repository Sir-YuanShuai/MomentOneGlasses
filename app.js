export default {
  onLaunch() {
    console.log('Moment One launched');
  },

  onShow() {
    console.log('Moment One active');
  },

  onHide() {
    console.log('Moment One backgrounded');
  },

  globalData: {
    appName: '一刻 YiKe · Moment One',
    version: '0.3.16',
    defaultUserId: 'local-user',
    timezone: 'Asia/Shanghai',
    repositoryMode: 'local',
    cloudSyncEnabled: false,
    mcpEnabled: true,
    mcpAppsEnabled: true
  }
};
