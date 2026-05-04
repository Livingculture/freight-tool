# Living Culture Freight Costing

A desktop app for checking Living Culture freight pricing without staff needing to open VS Code, Terminal, or a browser URL.

## Staff Instructions

1. Download the Freight Costing app.
2. Double-click the app to open it.
3. Enter a product SKU or product URL.
4. Add more products and quantities if needed.
5. Start typing the delivery address.
6. Select the correct address from the suggestions.
7. Click `Get freight price`.

The app will show the product details, estimated weight and CBM, warehouse information where available, and the freight total.

## Cin7 Helper

The Tampermonkey helpers are installed from GitHub:

```text
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-lc-freight.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-quote-memo-info.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-copy-sku.user.js
```

Install each link once in Tampermonkey on every computer. After that, Tampermonkey checks GitHub for script updates automatically because the scripts include `@updateURL` and `@downloadURL`.

Keep the Freight Costing app running locally. In Cin7, click `LC Freight` to open the freight panel, or `Quote Memo Info` to open the quote memo panel.

On Living Culture product pages, click `Copy SKU` to copy the current product SKU.

If the `LC Freight` button does not appear, check that Tampermonkey shows the script as enabled on the current Cin7 page. The script matches Cin7, Cin7 Core, and Dear Systems URLs.

The panel can:

- read the SKU and shipping address from Cin7
- get freight pricing from the local Freight Costing app
- show product details, stock, website link, weight, CBM, and carton count

## GitHub Updates

GitHub is the source for updates:

- Tampermonkey updates come from the raw GitHub script URLs above.
- The standalone app source can be updated from GitHub with:

```bash
npm run update
```

Then restart the app:

```bash
npm start
```

For installed desktop app builds, rebuild a new app after changes and install the new build on each computer.

## Development Setup

Install dependencies:

```bash
npm install
npm run install-playwright
```

Open the desktop app in development:

```bash
npm run dev
```

Run the old browser-based local server if needed:

```bash
npm run start:web
```

Then open:

```text
http://localhost:3001
```

## Build Apps

Build a Mac app:

```bash
npm run package:mac
```

Build a Windows app:

```bash
npm run package:win
```

Build outputs are created in `dist/`.

## Notes

- Playwright runs hidden in the background.
- The app uses Living Culture checkout to read address suggestions and freight pricing.
- Do not commit `node_modules`, `dist`, `build`, `.env`, `user-data`, or unrelated project folders.
