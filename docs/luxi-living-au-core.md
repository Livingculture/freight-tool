# Luxi Living Australia — Cin7 Core installer

This is a separate, manually installed Tampermonkey script:
`userscripts/luxi-living-au-all-in-one.user.js` (0.1.0).
The New Zealand All-in-One and its resources are unchanged.

Use a separate Australian Chrome profile with this installer. The New Zealand
installer also matches Core domains, so leaving it installed in the same profile
can still add its own New Zealand tools independently of this Australian script.

## Implemented

- Quote toolbar on `/Sale` in Cin7 Core when the current account selector shows
  Luxi Living / Luxi Living Pty Ltd. It is removed when the account or tab changes.
- Independent installer name, namespace, update URL, DOM IDs and Tampermonkey settings.
- Custom Comments: staff-entered product specifications with an editable preview,
  copy and explicitly requested field fill. An Australian text sheet can optionally
  replace the specifications builder.
- Quote Memo: searchable sections loaded from the Australian Information for Quotes
  Google document, copy, and explicitly requested field fill when one field is found.
  Existing field text requires confirmation before replacement.
- Install Fees: live, searchable AU assembly workbook rows, source prices labelled
  AUD, notes and Copy SKU. The original ProductCode / Name / PriceTier1 headers
  and zero-priced entries are supported.
- Custom Products: embeds the original AU Customised Products Oct26 PDF without
  re-parsing its price tables or sizing conditions. Open original is also available.
- New Products: opens the Australian Product Update folder.
- Promo Summary: available for an Australian source to be configured; no promo
  summary spreadsheet has yet been identified in the supplied folder.
- AU Sources settings, Luxi website and AU shared-folder links. External data loads only when a
  configured button is opened. Spreadsheet text is rendered as text, never HTML.
- No automatic save, authorise, payment, stock or tax changes.

## Australian sources

Defaults come only from the supplied Share Point (AU) folder. No New Zealand
prices, terms, staff mappings, fallback catalogues or spreadsheet IDs are included.
Sources are read-only; the original documents and folder are not modified.
The script does not copy a price snapshot into its source or use old prices if
the live spreadsheet becomes unavailable.

Select **AU Sources** to change a source, select a spreadsheet tab, or configure
Promo Summary. Google Sheets provide searchable tables, Google Docs provide text
sections, Drive files show the original preview and Drive folders provide a link.
Data exports must be readable without signing in; inaccessible exports show an
error. Drive previews use Google's own browser access controls. Do not put
credentials in source URLs.

Text sheet headers:

```csv
Title,Text
Example note,"Fictional wording for review."
```

Product sheet headers:

```csv
SKU,Product,Price,Unit,Notes
AU-DEMO,Example product,123.45,each,Fictional example only
```

Text also accepts Comment / Memo; product codes also accept Code / Product Code /
ProductCode and prices accept PriceTier1.
Prices are displayed exactly as supplied. No GST assumption or conversion is made.
Australian terms and actual price lists need business review before staff use.

## Manual / not included

- Add products, quantities, prices and discounts using Core's normal product controls;
  Copy SKU assists lookup. Automated line-item insertion is not implemented.
- If the memo/comments field cannot be uniquely identified, use Copy and paste.
- PDF product tables are displayed as the original document, not imported into
  product rows. Protected API feeds are not included.
- Workflow, Omni, New Zealand freight, HubSpot, WeCom and email integrations are
  not included. No account API credentials are required.
- The existing separate Luxi website Copy SKU script is not bundled into this
  Core-only installer.

## Verification

`scripts/test-luxi-au-core.cjs` tests fictional offline Core pages: tenant and route
isolation, separate settings, unconfigured-source behaviour, CSV quoting, source
document sections, zero prices, manual text fill / SKU copy, original PDF preview,
HTML injection prevention and account switching. The actual
Luxi Core account selector and field layout still require a live staff check.
