# Collage

A presenter screen shows a QR code. Phones scan it and upload photos, and the board re-tiles itself edge to edge on a white background in justified rows: each photo's cell follows its own shape, so portraits stay tall and landscapes wide, and rows are sized so the screen is filled with as little cropping as possible. The QR is one item near the middle: alone it fills the screen, then shares it with the first photos. The board holds up to 100 photos, each up to 10 MB.

Each photo has a fixed pseudo-random place in the order (from its id), so a new photo lands somewhere random rather than always at the end, and the photos around it shift to make room. The presenter downloads and decodes a new photo before making room for it, and reloads itself when a new version is deployed.

An admin can set a center image, which replaces the QR and is never cropped: it is always drawn whole, and its cell has its own shape. From two photos up it sits dead center, framed by the photos; it grows toward about four times the average photo as photos arrive (about 2× at six, 3× at a dozen, 4× from about thirty). With only a few photos, keeping it whole, centered and large means those few photos are cropped hard, and on two or three photos it may get thin white bands; with one photo it sits beside it. They can also switch between one photo per phone and many, download the board, or reset it. The phone page is Hebrew, RTL, and styled after igy.org.il.

```bash
npm install
npm run dev
```

Open the presenter at `/` and the phone page at `/join`. The admin password is `admin` locally. On Vercel there is no admin until `ADMIN_PASSWORD` is set.

## Storage

- Board state (photo list, mode, center image, presenter size) lives in Redis: `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Upstash for Redis on the Vercel Marketplace). Uploads update it with an atomic compare-and-set, so many phones can upload at once.
- Image bytes live in Vercel Blob: `BLOB_READ_WRITE_TOKEN`.
- Remote storage is used only when both are set; otherwise (local dev) everything lives in `.data/`. On Vercel the API answers 503 until both are configured, and the screens say the board is unavailable.

Don't keep board state in a Blob JSON file. Blob reads are eventually consistent, so an ETag compare-and-set on one file starts failing after a few writes. That was the "upload failed after ~6 photos" bug.

`npx tsx scripts/check-layout.ts` checks the layout: full coverage, no overlaps, a centered center image, and photo orientation.
