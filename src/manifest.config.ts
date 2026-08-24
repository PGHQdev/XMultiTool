import type { ConfigEnv } from 'wxt'

export const HOST_MATCH = 'https://x.com/*'

// Firefox logs a load warning for every key it does not know, so the sidePanel
// permission, minimum_chrome_version and side_panel stay out of the non-Chromium
// builds. WXT gives the Firefox build sidebar_action from the sidepanel entrypoint.
const CHROMIUM = ['chrome', 'edge']

export const manifest = ({ browser }: ConfigEnv) => {
  const chromium = CHROMIUM.includes(browser)
  return {
    name: 'XMultiTool',
    description: 'Reading control, data export and author tools for X.',
    permissions: (chromium
      ? ['storage', 'sidePanel', 'tabs']
      : ['storage', 'tabs']) as string[],
    // The declaration point for Tool.permissions: permissions.request only succeeds
    // for a name listed here. tests/manifest.test.ts holds the two lists together.
    optional_permissions: [] as string[],
    host_permissions: [HOST_MATCH],
    ...(chromium
      ? {
          minimum_chrome_version: '114',
          side_panel: { default_path: 'sidepanel.html' },
        }
      : {}),
    action: { default_title: 'XMultiTool' },
    web_accessible_resources: [
      { resources: ['xmt-main-world.js'], matches: [HOST_MATCH] },
    ],
  }
}
