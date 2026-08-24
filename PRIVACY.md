# Privacy

XMultiTool sends nothing anywhere.

- The extension makes no request to any host except `x.com`, and it makes those only by
  reading responses the site already requested.
- Settings and diagnostics stay in the browser profile. Nothing syncs.
- There is no telemetry, no analytics, no crash reporting and no account.
- The config export writes a file to the device. Whether it is shared is the user's choice.

Permissions and their reasons:

| Permission | Reason |
|---|---|
| `storage` | Keeps settings in the local profile |
| `sidePanel` | Opens the side panel |
| `tabs` | Reads which tab the side panel is showing |
| `scripting` | Injects the page-world reader into x.com |
| `https://x.com/*` | The only site the extension runs on |
