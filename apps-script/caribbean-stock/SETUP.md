# Live Caribbean Stock Button

The list and Google-authorised updater are prepared, but not deployed. A Google
Workspace editor of the Caribbean SOH spreadsheet must activate the Apps Script
project once. A spreadsheet sharing URL is not a write API or authorisation.

## Google Setup

1. Open the Caribbean SOH spreadsheet and choose **Extensions > Apps Script**.
2. Add the prepared project files: `Code.gs` and HTML file `Stock.html` from this
   directory. In Project Settings, enable the manifest editor and use the
   prepared `appsscript.json` manifest.
3. Confirm **Services > Google Sheets API (v4)** is enabled. For a standard Cloud
   project, its Google Sheets API must also be enabled in Google Cloud.
4. Deploy as a **Web app**, executing as **User accessing the web app**, with
   access restricted to the **Living Culture Workspace domain**. Do not enable
   anonymous access or expose a Google token in the Tampermonkey script.
5. Open the deployed URL, authorise the requested Google access, and inspect the
   real list before pressing any stock action. Keep the URL ending in `/exec`.
6. Install `userscripts/caribbean-stock.user.js`, disable the earlier Caribbean
   Stock Preview script, and refresh Core/Omni. Click **Caribbean Stock** and
   enter the `/exec` URL once. It can also be changed from Tampermonkey's
   **Connect Caribbean stock Google app** menu command.

Every rep uses their own Living Culture Google account and must have spreadsheet
edit access for updates. Staff can authorise the Google app when first opening
it. The signed-in Google email is recorded independently of the editable rep name.

## Behaviour

- Opens the full stock list directly: no required search or product lookup.
- One source row is one stock unit; duplicate product codes remain separate.
- **Hold 24 hours** requires a valid NZSO/SFOR quote and confirmation that the
  customer verbally agreed to pay. The row turns yellow; quote and NZ date fill.
- **Mark paid** requires confirmation that payment was received. The row turns
  red; quote and date fill. It does not charge a card or change Cin7 payments.
- Paid and other-quote held units cannot be reallocated. Customer Service still
  removes paid rows in the spreadsheet; this app has no delete/remove endpoint.
- Expired holds remain visible for review, not automatically released.
- Existing row colours and quote allocations are read from the actual sheet.
  Unknown colours, mixed statuses and quantities other than one block actions.
- Fresh reads and a script-wide lock guard competing button users. Each write
  uses one Google Sheets batch for the quote, date, row colour and allocation
  metadata. Failures do not report success or apply optimistic UI changes.
- Invisible row metadata supplies stable unit IDs, request receipts and exact
  hold timestamps. No new visible columns, tabs or duplicate tables are created.
- Column headings determine Quote Number and Date; no hard-coded K/Y columns.
- Direct manual spreadsheet edits do not participate in Apps Script locks. A
  fresh revision check rejects detected changes; avoid editing allocation cells
  manually while someone is applying a hold through the button.

## Verification

Run `node scripts/test-caribbean-stock-live.cjs`. The tests use mocked Google
services and browser fixtures, not your production sheet. Real Google consent,
Apps Script deployment and one agreed live test remain required after setup.

Google references:
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/html/communication
- https://developers.google.com/workspace/sheets/api/guides/batch
- https://developers.google.com/workspace/sheets/api/guides/metadata
