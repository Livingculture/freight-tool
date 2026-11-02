# Core To Omni Quote Transfer

This separate Tampermonkey script is not part of All-in-One. Version 0.2.4 uses
the existing server-side Core API connection, not a PDF or screenshot-based file.

## Staff Flow

1. Install/update `omni-core-quote-pilot.user.js`. Keep All-in-One enabled.
2. In Core, click **Copy Core Quote to Omni** and enter the Core quote number.
3. A Workflow tab performs the lookup. Sign in there if requested. Only office
   roles can read Core quotes through the authenticated transfer route.
4. That tab opens Omni and follows its native **New Quote** link. The original
   Core tab stays open and unchanged. Product lines are filled automatically.
   Customer matching is skipped; customer details and charges are left alone.
5. Review before saving. The transfer never saves, approves, pays, packs,
   dispatches or emails the new Omni quote.

For direct lookup on a new Omni quote, open the transfer panel, enter the Core
number and click **Load from Core**, then **Copy Line Items** after reviewing warnings.
This copies SKUs, quantities, prices and line discounts only. Enter the customer,
freight and other charges manually, and reconcile the final quote before saving.
The optional **Include customer details and charges** checkbox enables the full
quote attempt, including customer matching. It is off by default.
No local file is required. Search for existing Omni copies before transferring a
Core quote again; saved quotes are not automatically checked for duplicates.

## Data And Safety

- Server credentials stay on the server. Core API calls use the existing
  `CIN7_CORE_ACCOUNT_ID` and `CIN7_CORE_APPLICATION_KEY`, and are GET only.
- Exact reference matching is required. Quote lines come from `sale.Quote`;
  order/invoice lines are not substituted for a missing quote.
- Customer/contact, phone/mobile, delivery/billing addresses, memo, products,
  quantities, prices, discounts and charges come from Core. Missing values are
  not invented. Customer data must never be committed alongside the script.
- In optional full-quote mode, customer selection must resolve to a matching Omni customer. Ambiguous or
  missing customers stop the transfer; no customer IDs/records are fabricated.
  Searches accept the Core contact or account name, with email confirmation
  when supplied. If lookup fails before quote fields are written, staff can
  select the customer natively and retry Fill Quote on the same empty quote.
- Original reference/date, salesperson, terms, customer reference, notes and
  charge details are retained in Internal Comments. Matching native salesperson
  and payment-terms options are selected where available. Omni keeps its own new
  quote number and creation date.
- Shipping uses Freight; other positive additional charges use Surcharge;
  negative additional charges use Discount. Source charge details remain in notes.
- Current financial support is NZD with consistent 15% GST. Exclusive Core unit
  prices are converted to inclusive prices. Totals must reconcile; no unexplained
  discount or rounding adjustment is guessed.
- Only a new, empty quote is editable. Existing transactions, repeated SKUs or
  unconfirmed mappings stop the transfer. Make/Use expansions need manual review
  if the resulting grid differs. Partial imports are not retried/rolled back.
- Server responses target an allowed Cin7 origin. The browser verifies the
  popup identity, origin and request nonce. Private Tampermonkey handoffs expire
  in ten minutes, are destination-tab scoped and are deleted when consumed.
- Grid editors can be in-cell or floating over the selected cell. Numeric fields
  use native Tab commit. Adjacent-row editors and form submits are rejected.
  Activation includes native left-button and double-click event details;
  floating editors may be housed in a separate overlay table.
- Section matching supports legacy table headings and wrapped form columns,
  without treating an entire contact form as a second heading.

## Verification

`node scripts/test-core-api-quote-transfer.cjs` tests both browser entry paths
with mocked Core/Workflow/Omni services: number lookup, private handoff, customer,
phone/mobile, addresses, memo, representative, six lines, freight and GST/total.

`node scripts/test-omni-core-quote-pilot.cjs` retains legacy/floating-grid, commit,
adjacent-row and partial-failure regressions. Workflow's
`tests/core-quote-transfer.cjs` covers API mapping, exact lookup, tax/discount
reconciliation and authenticated route gates with mocked services.

Actual account data still needs a signed-in live test. The old JSON format is
retained only as a hidden regression input, not the number-based staff workflow.
