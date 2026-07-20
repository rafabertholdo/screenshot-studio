---
name: screenshot-studio
description: Generate App Store screenshots for an iOS app and frame them with Screenshot Studio. Use when the user wants marketing screenshots, framed App Store screenshots, or to refresh their App Store Connect gallery from simulator captures.
---

# App Store Screenshots with Screenshot Studio

Turn an iOS app into a finished App Store gallery in two steps:

1. **Capture** raw screenshots by running a UITest on iPhone + iPad simulators.
2. **Frame** them in [Screenshot Studio](https://github.com/rafabertholdo/screenshot-studio) — device mockups, captions, background, exact export sizes — then upload to App Store Connect.

Step 1 is fully automatable in this repo. Step 2 is a macOS app the user drives (you can help operate it, and re-render/upload headlessly).

## What you're producing

App Store Connect wants a **portrait gallery per device size**, at exact pixel
dimensions, **max 10 screenshots per size**. The end state is two folders of PNGs:

```
screenshots/<app>/
  iPhone/   01-Launch.png  02-Editor.png  …   (6.9" = 1320×2868)
  iPad/     01-Launch.png  02-Editor.png  …   (13"  = 2064×2752)
```

Naming rules that the rest of the pipeline depends on:

- **`NN-Name.png`** — the zero-padded `NN` (01, 02, …) sets gallery order; keep
  the same `Name` across both families when the same screen exists on iPhone and
  iPad, so the independent decks stay aligned. The families are not merged into
  one editable slide.
- **One appearance.** Pick light or dark and use it on every screen — a mixed
  gallery reads as broken in the store.

## Step 1 — Capture with a UITest

### Write (or extend) a UITest that walks each screen

Drive the app to each screen you want to sell and save a screenshot as a test
attachment. One helper keeps the naming consistent:

```swift
import XCTest

final class ScreenshotTests: XCTestCase {
    func testCaptureScreens() {
        let app = XCUIApplication()
        app.launch()

        snapshot(app, "01-Launch")

        app.buttons["Editor"].tap()
        snapshot(app, "02-Editor")

        app.buttons["Settings"].tap()
        snapshot(app, "03-Settings")
    }

    private func snapshot(_ app: XCUIApplication, _ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name           // "01-Launch" → filename after extraction
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
```

Lock the appearance so every run matches. Either pin it in the app under UITest
(`.preferredColorScheme(.dark)` behind a launch argument), or force the simulator
before the run: `xcrun simctl ui booted appearance dark`.

### Run it on an iPhone and an iPad simulator

Run twice, once per family, into separate result bundles:

```bash
xcodebuild test \
  -scheme <YourScheme> \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro Max' \
  -resultBundlePath /tmp/shots-iphone.xcresult

xcodebuild test \
  -scheme <YourScheme> \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)' \
  -resultBundlePath /tmp/shots-ipad.xcresult
```

Use the **largest** iPhone and iPad you can — the App Store scales one 6.9" set
and one 13" set down to the smaller sizes, so you only need those two.

### Extract the PNGs from the result bundle

The attachments live inside the `.xcresult`. Pull them out with `xcparse`
(`brew install chargepoint/xcparse/xcparse`), which names files by the attachment
name so `NN-Name` survives:

```bash
mkdir -p screenshots/<app>/iPhone screenshots/<app>/iPad
xcparse screenshots /tmp/shots-iphone.xcresult screenshots/<app>/iPhone
xcparse screenshots /tmp/shots-ipad.xcresult   screenshots/<app>/iPad
```

**Verify before moving on:** open a few PNGs and confirm every screen you wanted
is there, named `NN-Name`, and the appearance is consistent. Don't edit the raw
PNGs — Screenshot Studio treats them as the source of truth.

> No UITest yet? A quick manual alternative: launch the app on a booted simulator,
> navigate by hand, and `xcrun simctl io booted screenshot screenshots/<app>/iPhone/01-Launch.png`
> per screen. The UITest is worth it once you'll refresh screenshots more than once.

## Step 2 — Frame and upload with Screenshot Studio

Screenshot Studio is a macOS app (+ a `studio-shots` headless renderer). Get it
from https://github.com/rafabertholdo/screenshot-studio.

### Operate the app

1. **New Project** → pick a **template** (the background/mockup style new screens
   start from — you can restyle any screen afterward).
2. **Choose Folder** → the folder holding your `iPhone/` and `iPad/` subfolders.
   Studio creates one independent slide deck per family, ordered by `NN-Name`.
3. **Per slide**, on the canvas:
   - **Caption** — a short headline + subtitle (headlines don't wrap; keep them
     tight). Drag to position; snap guides align them across slides.
   - **Mockup** — the device frame around the screenshot.
   - **Placement** — move/scale the device. If a screen's UI stops partway down,
     push the device lower so the empty space runs off the bottom edge.
   - **Background** — the gradient/template behind the device.
4. **Switch** between the iPhone and iPad tabs. The tab changes the entire editor
   context, including the left pane, canvas, sidebar, and export settings. Style
   each family independently; missing captures never fall back to the other
   family.
5. **Export** — writes finished PNGs into `iPhone/` and `iPad/` at exact App Store
   sizes. **Don't resize or post-process the output** — App Store Connect
   validates the exact dimensions.

Projects save as one small JSON file per project in
`~/Library/Application Support/screenshot-studio/` (a folder path, the look of
each screen, App Store Connect destination, and localization data). Version
1.6 stores all locales in the same project file: the base `locale`, additional
`extraLocales`, and each text overlay's `localizations`. Do not create one
project file per language or expect locale-suffixed project copies.

The first launch migrates projects from the old
`~/Documents/Screenshot Studio/` location into Application Support without
overwriting files that already exist. It also combines legacy
`<Project Name> <locale>.json` files into the canonical `<Project Name>.json`
and leaves the old files available as a recovery source. Re-opening a project
re-reads its source folder, so a new capture there is picked up automatically.

For localized galleries, keep one Screenshot Studio project and add the target
locales in its localization controls. Export creates one locale subfolder per
locale when more than one is configured; upload publishes every configured
locale in one action. The screenshot source folder is still the folder imported
by that project (`iPhone/` and `iPad/`).

### Re-render headlessly

Once a project exists, regenerate its PNGs without opening the editor:

```bash
swift run studio-shots "<Project Name>" /tmp/<app>-shots
```

This is the fast loop for refreshing screenshots on a new release: re-run the
UITest, then re-render — the styling you already did is reapplied to fresh shots.

### Upload to App Store Connect

- **From the app:** add your App Store Connect API key (`.p8`) once in Settings
  (stored in the login keychain), then use the Upload sheet — pick app, version,
  locale. Studio checks every size against the 10-per-size limit *before* touching
  your account, so a bad set can't half-wipe your listing.
- **Headless / CI:** upload the rendered folders with the
  [`asc` CLI](https://github.com/rafabertholdo/App-Store-Connect-CLI):
  `asc screenshots upload --version-localization <id> --path /tmp/<app>-shots/iPhone --device-type APP_IPHONE_67 --replace`
  (repeat for iPad with `APP_IPAD_PRO_129`). Verify the gallery reads `COMPLETE`
  afterward.

## Gotchas

- **Exact sizes are enforced** — never resize the exported PNGs.
- **10 per size is a hard cap.** A **landscape** screen renders as two portrait
  panels side by side and spends **2** of those slots.
- **Keep `Name` consistent across families** when corresponding screens exist so
  the two independent decks remain aligned. A family may also contain screens
  that are absent from the other family.
- **Don't render back into the source `screenshots/` folder** — framing
  already-framed shots on the next import destroys the originals. Export elsewhere.
- **Upload only to an editable version** (`PREPARE_FOR_SUBMISSION`,
  `DEVELOPER_REJECTED`, …), and confirm the target version before uploading.
