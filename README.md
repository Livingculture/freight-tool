# Living Culture Freight Helper

A local JavaScript helper to use Living Culture's own cart autocomplete, capture address suggestions, and request the freight price from the site.

## Setup

1. Open the project folder in VS Code.
2. Run:

```bash
npm install
npm run install-playwright
```

3. Start the local tool:

```bash
npm start
```

4. Open the app in your browser:

```
http://localhost:3001
```

## How it works

- Enter the product page URL or the SKU from Living Culture.
- Type a partial address. Suggestions load automatically after 4 characters, or you can click `Get suggestions`.
- The local tool opens a headless Playwright browser in the background, resolves the SKU to the product variant, opens Shopify checkout, and reads the checkout address suggestions.
- Select a suggestion from the list.
- Click `Get freight price`.
- The tool selects the address suggestion in checkout, continues to the shipping step, and reads the freight price.
- The product preview also shows Shopify variant weight and estimated CBM calculated from package/carton dimensions in the product description.

## Important notes

- The selectors in `server.js` target Living Culture's current Shopify checkout fields.
- If Living Culture changes its cart, you may need to update selectors for:
  - checkout address input
  - autocomplete suggestion items
  - shipping/freight price text

## Customize selectors

Open `server.js` and replace the selector arrays with the exact selectors from the Living Culture site.

## Data storage

The automation runs in a fresh background browser session for each lookup.

## Weight and CBM

- Weight comes from Shopify variant data.
- CBM is estimated from package, carton, or box dimensions found in the product description.
- CBM is not a carrier-provided checkout breakdown, so treat it as an estimate.

## Disclaimer

This tool runs locally on your machine and uses Playwright to automate the site in a browser. It does not send your address to any third-party service.
