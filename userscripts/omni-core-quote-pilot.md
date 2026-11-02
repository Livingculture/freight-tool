# Core Quote Import Pilot

This is a separate, opt-in userscript. It is not included in All-in-One. It reads a
user-selected local JSON file and fills product lines through Omni's native grid.
It has no API credentials, network requests or persistent quote storage. Customer
data must never be committed alongside this script.

## Installation And Test

1. In Tampermonkey, use Utilities > Import from file to install
   `omni-core-quote-pilot.user.js`.
2. Search existing Omni quotes for the source reference to avoid duplicating an
   earlier copy. This pilot cannot search the account or check other tabs.
3. Open a new, unsaved Omni quote. Select the correct customer and confirm NZD and
   GST-inclusive pricing before importing. The script does not select a customer.
4. Click Core Quote Import Pilot near the quote heading, then choose the local
   quote JSON file. Review the source details and warnings.
5. Confirm the checks, then click Fill Product Lines. The pilot attempts exact SKU
   selection and sets quantity, unit price and percentage discount. It stops if
   the grid, product or editor cannot be uniquely identified.
6. Complete the address, freight, salesperson, quote date and internal source
   reference manually. Let Omni allocate its own quote number. Compare the native
   quote total and generated quote PDF with Core before any save or approval.

For the screenshot-based NZSO-16714 test, the local file is
`/Users/steveforeman/Desktop/NZSO-16714-omni-pilot.json`. The target is NZD
13,523.97 including GST, with NZD 169.00 freight. The separate NZD 200.00 discount
shown in the source summary is unresolved and is deliberately not applied again.
The customer delivery street address is missing. Verify the transcription against
Core; this is not an API export.

## Limits

- Only headings explicitly identifying New Quote and URLs without existing
  transaction IDs are supported. Other pages are refused rather than guessed.
- The product grid must be empty at the start. There is no automatic overwrite,
  rollback, retry or cross-tab duplicate protection.
- After a partial failure, inspect all entered lines manually. Reloading clears
  the in-memory attempt flag; it is not a way to resume an import safely.
- Make/Use expansions and substituted or ambiguous SKUs require manual review.
- Code selection supports native legacy Enter-key handlers and editors replaced
  during lookup. Enter is restricted to the exact SKU's Code input. Form submit
  events are blocked while importing. Unresolved SKUs stop the import rather than
  being accepted as plain text or substituted with another product.
- Customer matching, final GST calculation, freight and total verification are
  not automated. Check Product Lines only checks SKU count, quantities, unit
  prices and discounts, not the native quote grand total.
- The importer never clicks Save, Approve, Send or conversion controls. Native
  Omni behavior and other enabled scripts are outside its control.
- Verification uses a mock Omni grid in Playwright. Actual signed-in Omni behavior
  has not yet been tested. Disable this pilot after the test.

Run focused checks with `node scripts/test-omni-core-quote-pilot.cjs`.
