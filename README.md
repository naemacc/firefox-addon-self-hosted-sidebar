# Self-Hosted Sidebar

A Firefox extension that docks your self-hosted web apps, Docker services and local dev servers in the sidebar as named tabs.

## Features

- Named tabs. Give each app a name, or leave it blank to show the port.
- Tabs stay loaded while you switch, so each app keeps its state and scroll position.
- Works with localhost, 127.0.0.1, LAN IPs, `.local` names or your own domain, over http or https.
- Edit a tab by double-clicking or right-clicking it. Close it with the x or a middle-click.
- Three tab display modes: icon and name, icon only, or name only.
- Dark tab bar that suits the Firefox sidebar.
- Keyboard shortcut: `Alt+Shift+T` toggles the sidebar.

## Install

<!-- Add the Firefox Add-ons link here once the listing is live. -->

To try it from source, open `about:debugging`, choose **This Firefox**, click **Load Temporary Add-on**, and select `manifest.json`.

Requires Firefox 140 or newer on desktop.

## Usage

1. Open the sidebar with `Alt+Shift+T`.
2. Click **+**, enter the address of your app (for example `localhost:8080`) and an optional name.
3. Firefox asks for access to that host the first time. Access is granted one host at a time and can be revoked in the add-on's permissions.

To change the shortcut, open `about:addons`, click the gear icon and choose **Manage Extension Shortcuts**.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Saves your tab names and URLs locally. |
| `http://localhost/*`, `http://127.0.0.1/*` | Default hosts, so local dev servers work without a prompt. |
| Optional `http://*/*`, `https://*/*` | Requested one host at a time, only when you add or edit a tab. |
| `webRequest`, `webRequestBlocking` | Removes `X-Frame-Options` and the CSP `frame-ancestors` directive on responses from hosts you granted, only for pages shown inside this extension's sidebar, so those pages can load in the iframe. |

## Privacy

The extension collects no data and sends nothing to the developer or any third party. It only contacts the addresses you add, to load the page and find its icon. Your tab list is stored locally with `storage.local`.

## Known limits

- Many sites forbid being embedded. Large public sites and single sign-on pages may still refuse to load.
- For an https app with a self-signed certificate, open it once in a normal tab and accept the certificate.
- Firefox unloads sidebar content when the sidebar is closed or switched to another panel, so apps reload the next time you open it.
- The sidebar API does not exist on Firefox for Android.

## Development

There is no build step.

```
npx web-ext lint
npx web-ext run
npx web-ext build   # zip the files into web-ext-artifacts/ for upload not a build
```

## License

[MIT](LICENSE)
