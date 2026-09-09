# InkSign

An Android app. Draw your signature once. Open one document or several. Tap **Sign all
lines** and it goes on every signature line at once. Save the result as a normal PDF you can
email or WhatsApp. It can also split a PDF into separate files.

Everything happens on the phone. Documents and signatures are never uploaded anywhere —
the Android app does not even ask for internet permission.

---

## Installing it on Android

Download and open **[InkSign.apk](https://github.com/brosu-hue/imaans/releases/download/apk-latest/InkSign.apk)**
on the phone. Android will warn that the app is not from the Play Store — that is normal
for an app you install yourself. Allow the install and it appears in your app drawer.

The app is signed as **Rasuul**, which is the developer Android reports for it, and every
build checks that before publishing.

> **To make new builds install over the old one** rather than needing an uninstall first,
> the signing key has to stay the same between builds. Add it as repository secrets
> `ANDROID_KEYSTORE_BASE64` (the keystore file, base64 encoded) and
> `ANDROID_KEYSTORE_PASSWORD`. Without them each build creates a fresh key, which Android
> treats as a different app. The key is never stored in this repository.

A fresh APK is built automatically every time this repository changes. You can also grab it
from the **Actions** tab of any completed run.

---

## How to use it

**Draw your signature** — tap *New signature* and sign with your finger. It is saved on the
phone and reused every time, so you only do this once. You can keep several (a full
signature and initials, say) and switch between them.

**Open a document** — a PDF, or a photo of a printed form.

**Sign all lines** — the app looks for the lines you are meant to sign on and shows a blue
box over each one. Lines printed next to the words *Signature*, *Witness* or *Signed for and
on behalf of* are ticked for you; table borders and other rules are found but left unticked.
Tap any box to include or skip it, then confirm. If the form has *Date* lines, it offers to
fill in today's date as well.

**Adjust anything** — drag a signature to move it, use the blue dot to resize, or *Remove* it.
*Place one* drops a signature wherever you want if the form has no printed line.

**Save** — produces a normal PDF with the signature part of the page. It lands in your
Downloads folder and offers to send it on. Several documents can be saved as one combined
file or one file each.

**Split a PDF** — a separate tool on the home screen, nothing to do with signing. It shows the
pages as thumbnails: choose *Every page* or *In pairs*, or tap the dotted line between two
pages to cut there. The bottom bar says what you will get — "→ 3 files", "pages 1-2, 3, 4-5" —
before you commit, and each piece is named after the pages it holds, e.g. `report-pages-04-to-05.pdf`.

---

## What is in here

| Folder | What it is |
|---|---|
| `www/` | The whole app: plain HTML, CSS and JavaScript, no build step. It is bundled into the APK at build time, so there is no second copy to keep in sync. |
| `android/` | A thin native wrapper that shows `www/` in a WebView and adds the Android bits: the file picker, saving to Downloads, the share sheet, and the Back key. |
| `test/` | The end-to-end test suite — it drives the real app in a real browser at phone size. |
| `.github/workflows/` | Runs the tests, then builds the APK. Nothing is published unless the tests pass. |

Inside `www/`:

- `js/pad.js` — the signature pad. Stroke width follows how fast you move, so it looks like a
  pen rather than a marker. Strokes are kept as points, so *Save* re-renders at high
  resolution instead of blowing up the screen drawing.
- `js/detect.js` — finds the signing lines. It looks for long, thin, nearly solid horizontal
  runs of dark pixels with clear space above them, ignores anything that turns out to be a
  row of text, and drops rules that form a table. On a PDF it also reads the printed words to
  tell a *Signature* line from a *Date* line.
- `js/doc.js` — renders pages and handles placing, dragging and resizing.
- `js/export.js` — flattens everything into the PDF, and cuts one up again for *Split a PDF*. Placement goes through pdf.js's own
  viewport maths, so rotated and cropped pages land correctly instead of being guessed at.
- `js/store.js` — the signature library, in the phone's own storage.
- `vendor/` — [pdf.js](https://mozilla.github.io/pdf.js/) and
  [pdf-lib](https://pdf-lib.js.org/), bundled so the app works offline.

## Working on it

```bash
npm install
npm run fixtures     # builds the test documents
npm test             # drives the real app in a browser and checks the exported PDFs

npm run serve        # then open http://localhost:8099
```

The tests are the guard rail for the line detector: they sign a PDF, a rotated PDF and a
photo of a form, reopen each exported file and check that ink actually landed on the lines.

To build the APK locally you need the Android SDK and Gradle 8.10+:

```bash
cd android && gradle assembleRelease
```

`www/` is copied into the APK's assets by the build, so there is no second copy to keep in
sync.

To rename the app, change the `<title>` and manifest in `www/`, `app_name` in
`android/app/src/main/res/values/strings.xml`, and the icons in `www/icons/`.
