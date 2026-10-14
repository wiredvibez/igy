# Collage

A presenter screen shows a QR code. Phones scan it and upload photos, and the board re-tiles itself edge to edge on a white background: the QR fills the screen alone, splits 50:50 with the first photo, then thirds, and so on. Every new photo reflows the grid so all cells stay as large as possible. The board holds up to 100 photos, each up to 10 MB.

An admin can set a center image (it takes the QR's cell), switch between one photo per phone and many, download the board, or reset it. The phone page is Hebrew, RTL, and styled after igy.org.il.

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

`npx tsx scripts/check-layout.ts` checks the grid layout.
