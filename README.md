[🇬🇧 English](README.md) | [🇷🇺 Русский](README-RU.md)

# C.AI Web Enhancer

A free and open-source Tampermonkey userscript that adds useful features to the Character.AI web interface.

The project is focused on making the web version of C.AI more convenient for users who want a persistent chat archive, a cleaner interface, and additional controls without relying on a separate browser extension.

## Features

### 🗂️ Unlimited chat archive

Character.AI's recent-chat list is limited, which means older chats can disappear from the visible list as new chats are added.

C.AI Web Enhancer keeps a local archive of chats that fall out of the recent list, allowing them to remain accessible from the archive.

The archive is stored locally in the browser and is separate from Character.AI's own chat list.

### 🔄 Network-based chat detection

The script can monitor relevant `fetch` and `XMLHttpRequest` responses and extract chat information from Character.AI's web API responses.

This allows the archive to keep collecting chats in the background instead of relying only on the currently visible DOM elements.

The current version supports multiple response formats and can inspect nested API data when necessary.

### 📦 Import & export

The archive can be exported as a JSON file and imported again later.

This makes it possible to:

* create backups;
* move an archive to another browser or device;
* restore archived chats after clearing browser data;
* manually transfer archive data between installations.

### 🛡️ AdBlock

An optional built-in ad-blocking mode hides known Character.AI advertising and upgrade elements while attempting to avoid affecting unrelated interface elements.

The implementation uses targeted selectors and only collapses empty wrappers when appropriate.

### 🎨 Visual archive status

Optional visual indicators can show the state of chats in the main list and archive.

The script can distinguish newly tracked chats, older chats, and warning states using interface highlighting.

### 🧪 Developer & debug tools

The script includes developer/debug functionality for troubleshooting archive behavior, inspecting ordering, and viewing background logs.

The debug console can display internal actions and network-related events without requiring the browser's developer tools.

### 🔒 Multi-tab protection

The archive contains protection against stale browser tabs.

When a tab becomes outdated relative to the current archive state, archive-writing actions can be blocked until the page is reloaded. This helps reduce accidental archive corruption caused by multiple open Character.AI tabs.

## Installation

### 1. Install Tampermonkey

Install the Tampermonkey extension for your browser.

### 2. Install C.AI Web Enhancer

Open the latest `.user.js` release from this repository.

Tampermonkey should recognize it as a userscript and offer to install it.

You can also install the script directly from the repository's **Raw** file.

### 3. Open Character.AI

Go to:

`https://character.ai/`

The userscript will start automatically.

## Updating

Tampermonkey can automatically check for new versions when the userscript contains the project's update and download URLs.

Always use the latest version from this repository when possible.

## Data & privacy

C.AI Web Enhancer does not require a separate account, server, or external database.

Archive data is stored locally in the browser using `localStorage`.

The script processes Character.AI data available to the page in order to build and maintain the local chat archive.

The project does not intentionally send archived chat data to an external server.

## Important notes

This is an unofficial community-made userscript.

It is not affiliated with, endorsed by, or developed by Character.AI.

Character.AI can change its website, API responses, HTML structure, CSS classes, or endpoints at any time. Such changes may temporarily or permanently break some features of the userscript.

The script is provided as-is.

## Open source

This project is free and open source.

You are welcome to:

* inspect the source code;
* report bugs;
* suggest improvements;
* modify the script for your own use;
* contribute fixes and features.

### License

This project is licensed under the MIT License.

[📄 MIT License — English](LICENSE)
[🇷🇺 MIT License — Русский перевод](LICENSE-RU.md)

## Repository structure

```text
cai-web-enhancer/
├── cai-web-enhancer.user.js
├── README.md
├── README-RU.md
├── LICENSE
└── LICENSE-RU.md
```

## Disclaimer

Use the userscript at your own risk.

Because the archive is stored locally in the browser, clearing site data, browser storage, or `localStorage` can remove locally stored archive data.

Keep a JSON backup when the archive is important to you.

---

**C.AI Web Enhancer** — a community-made way to make the Character.AI web experience more convenient.
