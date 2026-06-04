# Living Culture Tools Setup

Use this guide to set up the Living Culture freight app and browser helpers on a staff computer.

## What Gets Installed

- Hosted Freight Costing service: calculates freight when the `LC Freight` button is used in Cin7.
- Freight Costing app: local fallback only, used before the hosted service is released or if directed by support.
- Tampermonkey: the Chrome extension that runs the helpers inside Cin7 and on livingculture.co.nz.
- Cin7 LC Freight helper: adds the `LC Freight` button in Cin7.
- Quote Memo Info helper: adds the `Quote Memo Info` button in Cin7.
- Installation Fee helper: adds the `Install Fees` button in Cin7.
- Custom Product helper: adds the `Custom Products` button in Cin7.
- Promo Summary helper: adds the `Promo Summary` button in Cin7.
- Copy SKU helper: adds the red `Copy SKU` button on Living Culture and Luxi Living product pages.

## 1. Install Chrome

Use Google Chrome for these tools.

If Chrome is already installed, continue to the next step.

## 2. Install Tampermonkey

1. Open Chrome.
2. Go to the Chrome Web Store.
3. Search for `Tampermonkey`.
4. Click `Add to Chrome`.
5. Confirm the install.
6. Pin Tampermonkey to the Chrome toolbar if you want easy access.

## 3. Allow Tampermonkey To Run

Chrome may ask for permission before Tampermonkey scripts work.

1. Open Chrome extensions:

```text
chrome://extensions
```

2. Find `Tampermonkey`.
3. Make sure it is enabled.
4. If Chrome shows an option called `Allow User Scripts`, turn it on.

## 4. Install The Tampermonkey Scripts

Open each link below in Chrome. Tampermonkey should open an install page for each one.

Click `Install` or `Update` when Tampermonkey asks.

```text
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-lc-freight.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-lc-freight-2.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-quote-memo-info.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-install-fee-helper.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-custom-product-helper.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-promo-summary.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-site-visit-link.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-copy-sku.user.js
https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/luxiliving-copy-sku.user.js
```

After installing, Tampermonkey will automatically check GitHub for updates.

## 5. Freight Costing Service

After the hosted service is released, no standalone Freight Costing app needs to be installed. Open Cin7 in Chrome and use the `LC Freight` button.

Only install the desktop fallback app when Living Culture support supplies it for testing or outage fallback.

On Mac:

1. Open the downloaded app file.
2. Drag the app to `Applications` if prompted.
3. Open `Freight Costing`.
4. If Mac blocks it, right-click the app and choose `Open`.

On Windows:

1. Open the installer supplied by Living Culture.
2. Follow the prompts.
3. Open `Freight Costing`.

When using the fallback app, keep it open while using the Cin7 `LC Freight` helper.

## 6. Check Cin7

1. Open Cin7 or Dear Systems in Chrome.
2. Open a quote.
3. Check near the `Additional charges and services` area.
4. You should see:

```text
Quote Memo Info
LC Freight
```

Near the top quote buttons, beside `Scan`, you should see:

```text
Install Fees
Custom Products
Promo Summary
```

## 7. Check Living Culture Product Pages

1. Open a product page on:

```text
https://livingculture.co.nz
```

2. Find the SKU near the product title.
3. You should see a red `Copy SKU` button beside the SKU.
4. Click it. The button should change to `SKU copied`.

## How To Use The Tools

### LC Freight

1. Open a Cin7 quote.
2. Make sure the Freight Costing app is open.
3. Click `LC Freight`.
4. The panel should read the products and delivery address from Cin7.
5. Check the quantities.
6. Click `Refresh freight with these quantities` if needed.

### Quote Memo Info

1. Open a Cin7 quote.
2. Click `Quote Memo Info`.
3. Click `Copy` to copy text only.
4. Click `Copy + Fill Quote Memo` to fill the quote memo and close the panel.

### Install Fees

1. Open a Cin7 quote.
2. Click `Install Fees`.
3. Search for the fee.
4. Click `Add`.
5. The helper will try to add the SKU and price to the quote line.

Install fee data is loaded from the shared Google Sheet. If the sheet cannot be reached, the helper uses the last cached data or the built-in fallback data.

### Custom Products

1. Open a Cin7 quote.
2. Click `Custom Products`.
3. Search for the custom product or pergola.
4. Click `Add`.

Custom product data is loaded from the shared Google Drive file. If the file cannot be reached, the helper uses cached data or built-in fallback data.

### Promo Summary

1. Open Cin7.
2. Click `Promo Summary`.
3. Search or review current promotion details.

Promo summary data is loaded from the shared Google Sheet. If the sheet cannot be reached, the helper uses cached data or built-in fallback data.

### Copy SKU

1. Open a Living Culture product page.
2. Click `Copy SKU`.
3. Paste the SKU where needed.

## Updating

Tampermonkey scripts update from GitHub automatically.

To manually check:

1. Click the Tampermonkey icon in Chrome.
2. Open `Dashboard`.
3. Go to `Utilities`.
4. Click `Check for userscript updates`.

For the normal hosted Freight Costing service, Tampermonkey receives script updates automatically. If using the fallback app, install the newest app version supplied by Living Culture.

## Troubleshooting

### Buttons Do Not Show In Cin7

1. Refresh the Cin7 page.
2. Check Tampermonkey is enabled.
3. Check the scripts are installed and enabled in the Tampermonkey dashboard.
4. Make sure you are using Chrome.

### A Script Link Shows 404 Or Does Not Open Tampermonkey

1. Check the computer is signed into a GitHub account that can access the `Livingculture/freight-tool` repo.
2. If staff should install without signing into GitHub, the repo must be public or the script files need to be supplied another way.
3. Open the raw script link again after access is fixed.

### LC Freight Does Not Load A Price

1. Refresh the Cin7 page and try `LC Freight` again.
2. Check the quote has a product SKU.
3. Check the quote has a shipping address.
4. Close and reopen the `LC Freight` panel.
5. If support has told you to use the fallback desktop app, check that it is open.

### Install Fees Does Not Show Updated Sheet Data

1. Check the computer has internet.
2. Refresh Cin7.
3. Open `Install Fees` again.
4. Check the Google Sheet is shared so people with the link can view it.

### Copy SKU Does Not Show On A Product Page

1. Refresh the product page.
2. Check the page has a visible SKU.
3. Check the `Living Culture Copy SKU` script is enabled in Tampermonkey.
