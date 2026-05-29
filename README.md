# Living Culture Freight Costing

A freight pricing service for Cin7, with a desktop fallback while the hosted Vercel service is being commissioned.

## Staff Setup Guide

Use [STAFF_SETUP.md](./STAFF_SETUP.md) when setting up another staff computer.

For a browser-friendly version, open [STAFF_SETUP.html](./STAFF_SETUP.html).

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
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-install-fee-helper.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-custom-product-helper.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-promo-summary.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-site-visit-link.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-copy-sku.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/luxiliving-copy-sku.user.js
```

Install each link once in Tampermonkey on every computer. After that, Tampermonkey checks GitHub for script updates automatically because the scripts include `@updateURL` and `@downloadURL`.

Once the hosted freight service is deployed and its URL is entered in `userscripts/cin7-lc-freight.user.js`, staff only need Tampermonkey. In Cin7, click `LC Freight` to open the freight panel, or `Quote Memo Info` to open the quote memo panel.

Until the hosted service is commissioned, keep the Freight Costing desktop app running locally when using `LC Freight`.

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

## Hosted Cin7 Freight Service

The hosted service uses the existing Express freight endpoints on Vercel. When deployed, Vercel launches serverless Chromium to obtain freight prices from the Living Culture checkout flow. The desktop app remains a fallback and uses its packaged Playwright browser.

1. Import this GitHub repository as a new Vercel project.
2. Use Node.js `24.x` for the Vercel project.
3. Deploy the project and copy the production domain, such as `https://your-freight-domain.vercel.app`.
4. Set `HOSTED_API_BASE` in `userscripts/cin7-lc-freight.user.js` to that production domain.
5. Push the userscript update so Tampermonkey installs the hosted version.
6. Confirm `https://your-freight-domain.vercel.app/api/health` returns an `ok` response.
7. Test `LC Freight` from a Cin7 quote before releasing it to staff.

The hosted API only enables browser access from Cin7, Cin7 Core, Dear Systems and local development pages. Do not expose the hosted domain broadly; browser automation has Vercel compute cost.

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

### Download A Windows Installer From GitHub

Windows installers must be built on Windows so the packaged Playwright Chromium browser is the Windows version. The GitHub Actions workflow builds this automatically when app packaging changes are pushed to `main`.

1. Open the `freight-tool` repository in GitHub.
2. Open `Actions`, then `Build Windows installer`.
3. Open the latest successful run.
4. Download the `living-culture-freight-windows-installer` artifact.
5. Unzip the artifact and use `Living Culture Freight Costing Setup 0.1.0.exe`.

The workflow can also be started manually from `Actions` with `Run workflow`.

## Notes

- Playwright runs hidden in the background and packaged desktop builds include their platform-specific Chromium browser.
- The app uses Living Culture checkout to read address suggestions and freight pricing.
- Do not commit `node_modules`, `dist`, `build`, `.env`, `user-data`, or unrelated project folders.
