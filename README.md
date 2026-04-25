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

The Tampermonkey helper is in:

```text
userscripts/cin7-lc-freight.user.js
```

Install it in Tampermonkey, then keep the Freight Costing app running locally. In Cin7, click `LC Freight` to open the side panel.

The panel can:

- read the SKU and shipping address from Cin7
- run a manual SKU/address lookup
- fill the Cin7 shipping price field
- copy the freight price as a backup

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
