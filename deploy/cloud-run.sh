#!/usr/bin/env bash
# Usage: deploy/cloud-run.sh <image> <env-vars-yaml>
set -euo pipefail
gcloud run deploy tuji-web \
  --project=tuji-web-prod --region=asia-northeast1 \
  --image="$1" --env-vars-file="$2" \
  --allow-unauthenticated --port=8080 \
  --cpu=1 --memory=1Gi --concurrency=80 --timeout=300 \
  --min-instances=0 --max-instances=10 \
  --cpu-boost --execution-environment=gen2
