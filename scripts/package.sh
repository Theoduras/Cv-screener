#!/usr/bin/env sh
# Zips extension/ into site/cv-screener.zip, which the Vercel page serves as the download.
set -e
cd "$(dirname "$0")/.."
rm -f site/cv-screener.zip
(cd extension && zip -qr ../site/cv-screener.zip . -x '.*')
echo "site/cv-screener.zip ($(du -h site/cv-screener.zip | cut -f1)), version $(grep '"version"' extension/manifest.json | cut -d'"' -f4)"
