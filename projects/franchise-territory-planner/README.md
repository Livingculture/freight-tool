# Living Culture Franchise Territory Planner

Standalone static Vercel project for the Living Culture franchise sales page and territory calculator.

## Local Preview

```bash
cd projects/franchise-territory-planner
npm run dev
```

Or open `index.html` directly in a browser.

## Deploy As A Separate Vercel Project

Import the same GitHub repository into Vercel a second time and use these project settings:

```text
Project name: livingculture-franchise-territory-planner
Root directory: projects/franchise-territory-planner
Framework preset: Other
Build command: npm run build
Output directory: .
Install command: npm install
Node.js version: 24.x
```

Keep the existing freight project pointed at the repository root. This folder is intentionally separate so the franchise page deploys independently from the hosted freight API.

## Notes

- The page is static HTML and uses Leaflet from a CDN.
- The New Zealand and Australia market data is starter planning data for purchaser conversations.
- Replace calculator assumptions and enquiry contact details with approved commercial figures before public release.
