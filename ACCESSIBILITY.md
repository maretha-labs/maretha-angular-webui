# Accessibility

## What every pull request checks

The required check **Accessibility scans and keyboard paths** runs on every pull request:

- **Automated scans** with axe (WCAG 2.0, 2.1 and 2.2 level A and AA rules, plus best
  practices) and IBM Equal Access, across the declared language and theme states.
- **Keyboard paths** through menus, dialogs, Quick Search, document tabs, trees and file
  upload: opening, arrow-key navigation, Escape and focus return.
- **Visual preferences:** contrast of localized headings (at least 4.5:1), a narrow layout
  with enlarged text, text-spacing overrides and forced-colors emulation.

Every axe violation and every unreviewed IBM violation fails the check. Details are in
[e2e/README.md](e2e/README.md).

## What it does not prove

A passing check is not a claim of full WCAG conformance. The suite does not test screen
readers or other assistive technology, actual browser zoom or 400% reflow, or an
operating-system high-contrast session. Those need a manual review.

## Reporting a barrier

Open a [bug report](https://github.com/maretha-labs/maretha-angular-webui/issues/new/choose).
Name the page, your browser and assistive technology with their versions, what you expected
and what happened. Accessibility bugs are product bugs: once one carries `confirmed:bug`, the
fix follows the normal route in [CONTRIBUTING.md](CONTRIBUTING.md).
