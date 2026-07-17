# Local media sources

Place only project-owner photographs in the approved category folders. Supported
source extensions are `.jpg`, `.jpeg`, and `.png`. Source images are ignored by
Git and are never deployed because Cloudflare Pages publishes only `public/`.

Read `docs/MEDIA_REQUIREMENTS.md`, use the exact required filename, then run:

```powershell
npm.cmd run media:check
npm.cmd run media:build
```

Never put downloaded, licensed-from-the-web, or third-party images here.
