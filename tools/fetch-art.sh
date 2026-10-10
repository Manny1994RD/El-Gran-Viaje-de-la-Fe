#!/bin/sh
# Downloads the Higgsfield illustrations into public/art/ (title cards, splash, logo, victory).
# Run from the project folder:  sh tools/fetch-art.sh
set -e
BASE=https://d8j0ntlcm91z4.cloudfront.net/user_3DhQuVeAP6eEge58X1LDvrzHN3o
mkdir -p public/art
get() { curl -fsSL "$BASE/$2" -o "public/art/$1" && echo "ok  $1" || echo "FAILED  $1"; }
get w01.webp     hf_20261010_210845_92771471-43c9-4acd-884a-f68106977da0_min.webp
get w02.webp     hf_20261010_210844_6f63ffc8-439c-4de3-9311-0efef879b084_min.webp
get w03.webp     hf_20261010_210844_1bd8c562-e05c-407a-b722-2b5200b71c44_min.webp
get w04.webp     hf_20261010_210844_d18dc8bd-ac39-414c-946c-38fd93302553_min.webp
get w05.webp     hf_20261010_210844_60682f0f-2d61-4b0d-87df-d774a26f0a49_min.webp
get w06.webp     hf_20261010_210845_5f5bf753-374f-4aeb-8246-d1161c96b118_min.webp
get splash.webp  hf_20261010_210843_a47d3d8c-6f06-4f6f-919f-a353fdb1501b_min.webp
get logo.webp    hf_20261010_210845_76eff898-55c0-4c0b-9936-4e161dc71519_min.webp
get victory.webp hf_20261010_210844_c4797ee9-b43f-4be0-b950-f399c7c54f90_min.webp
