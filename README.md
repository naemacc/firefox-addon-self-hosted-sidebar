<div align="center">

<img src="icons/icon-128.png" alt="Self-Hosted Sidebar icon" width="96" height="96">

# Self-Hosted Sidebar

**Dock your self-hosted apps, Docker services and local dev servers in Firefox's sidebar as named vertical or horizontal tabs, with an address bar.**

[![Get the add-on](https://img.shields.io/badge/Firefox-Get%20the%20add--on-FF7139?logo=firefox-browser&logoColor=white&style=for-the-badge)](https://addons.mozilla.org/en-US/firefox/addon/self-hosted-sidebar/)

![Firefox 142+](https://img.shields.io/badge/Firefox-142%2B-orange?logo=firefox-browser&logoColor=white)
![License: MIT](https://img.shields.io/github/license/naemacc/firefox-addon-self-hosted-sidebar)
![No data collected](https://img.shields.io/badge/data%20collected-none-brightgreen)

</div>

<p align="center">
  <img src="preview-pictures/screenshot-1.png" alt="Self-Hosted Sidebar showing a dashboard in Firefox" width="720">
</p>

---

## What it does

Self-Hosted Sidebar keeps the web apps you run yourself one keystroke away while you browse. Add an address, give it a name, and it lives in the Firefox sidebar as a tab.

Great for:

- Dashboards (Homepage, Heimdall, Grafana)
- Media servers (Jellyfin, Plex, Navidrome)
- Home automation panels (Home Assistant)
- Dev servers (Vite, Next.js) and docs sites running in Docker
- Anything you can reach at a local or LAN address

> This add-on is built for apps you host yourself. Large public websites usually refuse to load inside a sidebar, so they are not supported.

## Screenshots

| Horizonatal Tabs                           | Vertical Tabs                                 | Vertical Expanded Hover                        |
| ------------------------------------------ | --------------------------------------------- | ---------------------------------------------- |
| ![Tabs](preview-pictures/screenshot-2.png) | ![Add tab](preview-pictures/screenshot-3.png) | ![Edit tab](preview-pictures/screenshot-4.png) |

## Features

**Tabs**

- **Vertical or horizontal.** Vertical tabs in the style of Firefox and Zen, or the classic horizontal strip.
- **Essentials, Pinned and regular tabs.** Essentials are icon tiles outlined in the color of their favicon. Pinned and Essential tabs have no close button, so they cannot be closed by accident.
- **Named tabs.** Give each app a name, or leave it blank to show the port.
- **Tabs stay loaded.** Switching keeps each app's state, scroll position and connections.
- **Works with any address you host.** `localhost`, `127.0.0.1`, LAN IPs, `.local` names or your own domain, over http or https.
- **Easy editing.** Double-click a tab to edit it, right-click for a menu (edit, reload, pin, add to Essentials, close), and drag to reorder within a group. Close a regular tab with the x that appears on hover, or with a middle-click.

**Address bar**

- **Back, forward and reload.** Back and forward only appear when there is somewhere to go.
- **Address field with a copy-link button.** Type an address and press Enter to go there.
- **Page history for each tab.** A button on the right lists the pages you visited in that tab, so you can jump straight to one.
- **Placement.** A bar across the top with vertical tabs, and below the tab strip with horizontal tabs. It can be turned off, and back, forward and reload then move to the bottom toolbar.

**Layout and look**

- **Compact mode.** Shrinks the vertical tab bar to a thin strip of icons. It can expand when hovered, floating over the page or pushing it aside.
- **Auto-hide.** Hides the tab bar, the address bar, or both until you hover their edge. It works on its own or together with compact mode.
- **Display modes.** Favicon and name, favicon only, or name only.
- **Three sizes.** Small, medium (matches Zen's own sidebar) and large.
- **Essentials box.** Show a background box on every Essential, only on the selected one, or none.
- **Toolbar buttons.** Show or hide the collapse button and the back and forward buttons.
- **Keyboard shortcut.** `Alt+Shift+T` toggles the sidebar.

## Install

[![Add to Firefox](https://img.shields.io/badge/Add%20to%20Firefox-FF7139?logo=firefox-browser&logoColor=white&style=for-the-badge)](https://addons.mozilla.org/en-US/firefox/addon/self-hosted-sidebar/)

## Usage

1. Open the sidebar with `Alt+Shift+T`.
2. Click **New tab**, enter the address of your app (for example `localhost:8080`), an optional name, and a type (Regular, Pinned or Essential).
3. Approve the access prompt the first time you add a host. Access is granted one host at a time and can be revoked later in the add-on's permissions.
4. Open the settings from the gear at the bottom of the tab bar, or from `about:addons`, to change layout, compact mode, auto-hide and appearance.

To change the shortcut, open `about:addons`, click the gear icon and choose **Manage Extension Shortcuts**.

## Settings

| Setting         | Options                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Tab layout      | Vertical, or horizontal (classic strip).                                                                                         |
| Tab bar side    | Left or right of the sidebar panel (vertical tabs only).                                                                         |
| Address bar     | Show or hide it.                                                                                                                 |
| Compact mode    | Thin icon strip (vertical tabs only), with an option to expand on hover.                                                         |
| Auto-hide       | Vertical tabs: off, address bar only, tab bar only, or both. Horizontal tabs: one switch for the strip and address bar together. |
| Hover style     | Float over the page, or push the page aside. Applies to compact expansion and to auto-hidden bars.                               |
| Toolbar buttons | Collapse button, back and forward. Settings and reload are always shown.                                                         |
| Tab display     | Favicon and name, favicon only, or name only.                                                                                    |
| Tab size        | Small, medium or large.                                                                                                          |
| Essentials box  | On every Essential, only on the selected one, or off.                                                                            |

Settings that have no effect for your current combination are greyed out.

> Firefox decides which side of the window the sidebar is on. "Tab bar side" moves the tabs inside the panel. To move the whole sidebar, use Firefox's own sidebar settings.

## Permissions

| Permission                                 | Why                                                                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                  | Saves your tabs, settings and each tab's recently visited pages locally.                                                                                                                            |
| `http://localhost/*`, `http://127.0.0.1/*` | Default hosts, so local dev servers work without a prompt.                                                                                                                                          |
| Optional `http://*/*`, `https://*/*`       | Requested one host at a time, only when you add or edit a tab, or type an address on a host you have not granted.                                                                                   |
| `webRequest`, `webRequestBlocking`         | Removes `X-Frame-Options` and the CSP `frame-ancestors` directive on responses from hosts you granted, only for pages shown inside this extension's sidebar, so those pages can load in the iframe. |

Only grant access to hosts you trust.

For the hosts you granted, a small helper script (`frame-nav.js`) is also registered. It stays idle until the sidebar page greets it, only runs inside frames shown in this sidebar, and reports the frame's address, title and back/forward state back to the sidebar. It makes no network requests. No extra permission is needed for it, for the address bar, or for the copy-link button.

## Privacy

The extension collects no data and sends nothing to the developer or any third party. It only contacts the addresses you add or type, to load the page and find its icon. Your tabs, settings and the list of pages visited in each tab (address and title, up to 30 per tab) are stored locally with `storage.local`. A tab's list can be cleared from the history menu and is deleted when you close the tab.

## Known limits

- Many sites forbid being embedded. Large public sites and single sign-on pages will likely refuse to load.
- Back and forward, the live address and the page history rely on the helper script. If it cannot run on a page, the address bar shows the tab's saved address and back and forward stay hidden.
- Redirects and routing that a page performs while it is loading do not count as history, so Back does not appear until you navigate within the page yourself.
- For an https app with a self-signed certificate, open it once in a normal tab and accept the certificate.
- Firefox unloads sidebar content when the sidebar is closed or switched to another panel (such as History), so apps reload the next time you open it.

## Development

There is no build step.

1. Check the extension

   ```bash
   npx web-ext lint
   ```

2. Launch in a temporary Firefox profile

   ```bash
   npx web-ext run
   ```

3. Create the zip

   ```bash
   npx web-ext build
   ```

Files:

| File                         | Purpose                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `manifest.json`              | Extension manifest.                                             |
| `background.js`              | Removes frame-blocking headers and registers the helper script. |
| `frame-nav.js`               | Helper script that reports back/forward state and address.      |
| `sidebar.html`, `sidebar.js` | The sidebar: tab bar, address bar, history menu.                |
| `options.html`, `options.js` | The settings page.                                              |

Issues and pull requests are welcome. Please ensure you fork the repository and submit all Pull Requests to the `dev` branch, as this project follows a `dev` -> `main` workflow.

## License

[MIT](LICENSE)

---

<sub>Not affiliated with any of the projects you may choose to embed.</sub>
