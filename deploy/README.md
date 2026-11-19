# Production deploy

Production runs on Cloud Run (`tuji-web`, project `tuji-web-prod`, region `asia-northeast1`).
`tuji.nexflow.team` maps to it through a Cloud Run domain mapping. In Cloudflare the record is
a proxied CNAME to `ghs.googlehosted.com`. Configuration rules set SSL to Full for this host
(Full, not Strict, so a missed Google certificate renewal does not take the site down) and turn
off Browser Integrity Check for `/api/`. Two WAF custom rules block the 2026-11-19 crawler on
non-`/api` paths. Bot Fight Mode must stay off, because it challenges the apps' API calls.

Every push to `main` runs `.github/workflows/deploy-cloud-run.yml`. Cloud Build builds the
image from `Dockerfile`, which runs `scripts/migrate.ts` against production before
`next build`, the same order Vercel's production build used. The workflow then deploys the
image and sets `VERCEL_GIT_COMMIT_SHA` to the pushed commit.

## Environment variables live in two places

- Runtime values are set on the Cloud Run service. Change one with
  `gcloud run services update tuji-web --region=asia-northeast1 --update-env-vars=KEY=value`.
- Build values are the `build-env` secret in Secret Manager. It is a shell file of
  `export KEY='value'` lines. The build needs `DATABASE_URL` for migrate and for pages
  prerendered from the database, such as the sitemap, plus the `NEXT_PUBLIC_*` values.

A new or changed variable usually belongs in both. Add a secret version with
`gcloud secrets versions add build-env --data-file=<file>`.

The `VERCEL_ENV`, `VERCEL_URL` and `VERCEL_GIT_COMMIT_SHA` names are kept because code reads them.

## Scheduled jobs

Cloud Scheduler calls the daily crons with `Authorization: Bearer $CRON_SECRET`. The jobs are
`cron-partman`, `cron-atlas-cleanup` and `cron-play-voided`, scheduled in UTC.

## The Vercel project

The Vercel project only proxies `everyday-english-picture-dictionary.vercel.app` to
`tuji.nexflow.team`. Shipped iOS and Android builds call that host. It has no Git connection
and runs no functions. Delete it once no supported app version calls the vercel.app host.

## Manual deploy

`deploy/cloud-run.sh <image> <env-vars.yaml>` redeploys with the full service configuration.
