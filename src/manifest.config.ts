export const HOST_MATCH = 'https://x.com/*'

export const manifest = {
  name: 'XMultiTool',
  description: 'Reading control, data export and author tools for X.',
  permissions: ['storage', 'sidePanel', 'tabs', 'scripting'] as string[],
  host_permissions: [HOST_MATCH],
  minimum_chrome_version: '114',
  side_panel: { default_path: 'sidepanel.html' },
  action: { default_title: 'XMultiTool' },
  web_accessible_resources: [
    { resources: ['xmt-main-world.js'], matches: [HOST_MATCH] },
  ],
}
