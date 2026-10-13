# Collage

A presenter screen shows a QR code. Phones scan it, upload photos, and those photos arrange themselves around the code. An admin can set a center image, switch between one photo per phone and many, download the board, or reset it.

```bash
npm install
npm run dev
```

Open the presenter at `/` and the phone page at `/join`. The admin password defaults to `admin` (`ADMIN_PASSWORD` overrides it).

On Vercel, connect a Blob store so `BLOB_READ_WRITE_TOKEN` is set. Without it, production refuses uploads. Locally, images and the session live in `.data/`.
