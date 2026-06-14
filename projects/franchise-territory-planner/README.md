# Living Culture Franchise Territory Planner

Standalone static Vercel project for the Living Culture franchise sales page and territory calculator.

## Local Preview

```bash
cd projects/franchise-territory-planner
npm run dev
```

Or open `index.html` directly in a browser.

## Deploy As A Separate Vercel Project

Create a standalone Vercel project and deploy this folder with these settings:

```text
Project name: living-culture-franchise-planner
Production URL: https://living-culture-franchise-planner.vercel.app
Root directory: .
Framework preset: Other
Build command: npm run build
Output directory: .
Install command: npm install
Node.js version: 24.x
```

Keep the existing freight project pointed at the repository root. The live Vercel project is intentionally separate from the freight API project.

## Notes

- The page is static HTML and uses Leaflet from a CDN.
- The New Zealand and Australia market data is starter planning data for purchaser conversations.
- Replace calculator assumptions and enquiry contact details with approved commercial figures before public release.
