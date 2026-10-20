# Caribbean Stock Preview

Separate Tampermonkey script for Cin7 Omni and Cin7 Core. It is not included in
Living Culture All-in-One and does not replace an existing script.

## Install And Try

Install `caribbean-stock-preview.user.js` in Tampermonkey, then refresh Cin7.
The **Caribbean Stock · Preview** button appears in Omni's Workflow action row,
beside Core's Promo Summary when its toolbar supports inline buttons, or as a
floating button at the bottom right.

The configured Caribbean SOH Google Sheet is requested read-only when opened.
It currently requires Google sign-in. Use **Open spreadsheet** with your staff
Google account and retry. Browser cookie restrictions can still prevent a
Tampermonkey read; no public-sharing change is made or required for the sample.

Use **Load screenshot sample** to try the interface without Google access. The
sample contains the 17 individual units shown in the 20 October 2026 screenshot.
It is labelled as sample data, not current stock.

Search and filter the units, then choose **Preview hold** or **Preview paid**.
Check or enter the quote, customer and rep, confirm the relevant condition, and
choose **Save preview only**. **Clear** removes a simulated state. A hold lasts
24 hours and remains flagged for review after expiry; it is not auto-released.

## Important Limits

- No Google Sheets writes, real reservations, payments, order edits or deletions.
- Simulations are stored only in this script's local Tampermonkey storage. They
  are not a shared staff reservation system or a multi-user stock lock.
- Each source row stays separate, including duplicate products. The parser uses
  column headings rather than the inconsistent column letters in the old guide.
- The Google data export does not include yellow/red formatting. Without an
  explicit Status heading, unallocated rows say **Check sheet**, not Available.
  Existing quote allocations and invalid per-unit quantities block new actions.
- Failed refreshes mark earlier sheet data as stale and disable preview actions.
- Changed row content cannot silently inherit an earlier simulated reservation.
- Preview Clear is not Customer Service removal. Production permissions and
  shared, conflict-safe writes would be a separate implementation after approval.

## Checks

Run `node scripts/test-caribbean-stock-preview.cjs` for parser, safety and browser
fixtures on Core and Omni at desktop, iPad and mobile widths. The test uses mocked
Google responses; it does not reserve real stock or write to Google or Cin7.
