#!/bin/sh
rm screenbreak-extension-firefox.zip screenbreak-extension-chromium.zip screenbreak-extension-edge.zip
cp manifest.json manifest.copy.json

jq "del(.options_page,.background.persistent,.permissions[0])" manifest.copy.json > manifest.json
zip -r screenbreak-extension-firefox.zip manifest.json extension lib _locales

jq "del(.browser_specific_settings,.permissions[1],.options_ui.browser_style)" manifest.copy.json > manifest.json
zip -r screenbreak-extension-chromium.zip manifest.json extension lib _locales

jq "del(.browser_specific_settings,.permissions[1],.options_ui.browser_style)" manifest.copy.json > manifest.json
zip -r screenbreak-extension-edge.zip manifest.json extension lib _locales

mv manifest.copy.json manifest.json