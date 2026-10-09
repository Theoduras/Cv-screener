#!/usr/bin/env sh
# Builds both ways of using the screener from extension/:
#   site/cv-screener.zip  the Chrome extension, downloaded from the page
#   site/app/             the same screener as a plain web page (no install)
set -e
cd "$(dirname "$0")/.."
version=$(grep '"version"' extension/manifest.json | cut -d'"' -f4)

rm -f site/cv-screener.zip
(cd extension && zip -qr ../site/cv-screener.zip . -x '.*')

rm -rf site/app && mkdir -p site/app
cp -r extension/lib extension/vendor extension/app.js extension/vacancies.js extension/app.css extension/config.js extension/icon.png site/app/
# the fetch proxy shares the robots.txt reader and the blocked-sites list with the finder
cp extension/lib/jobs.js site/api/_jobs.js
sed "s|<meta charset=\"utf-8\">|<meta charset=\"utf-8\"><meta name=\"cvs-version\" content=\"$version-web\"><link rel=\"icon\" href=\"icon.png\">|" extension/app.html > site/app/index.html

echo "site/cv-screener.zip ($(du -h site/cv-screener.zip | cut -f1)) and site/app/ ($(du -sh site/app | cut -f1)), version $version"
