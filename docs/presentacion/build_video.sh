#!/bin/sh
# Builds the narrated video: slide-01..09.png + audio/01..09.(mp3|wav|m4a) -> Gran-Viaje-presentacion.mp4
# Each slide stays on screen for its narration plus a short pause; slides fade in and out.
set -e
cd "$(dirname "$0")"
rm -rf seg && mkdir seg
LIST=seg/list.txt; : > $LIST
for i in 01 02 03 04 05 06 07 08 09; do
  A=$(ls audio/$i.* 2>/dev/null | head -1)
  [ -z "$A" ] && { echo "missing audio/$i"; exit 1; }
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$A")
  T=$(python3 -c "print(round($DUR + 1.4, 2))")
  FO=$(python3 -c "print(round($T - 0.4, 2))")
  ffmpeg -loglevel error -y -loop 1 -i slide-$i.jpg -i "$A" \
    -filter_complex "[0:v]scale=1920:1080,format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=$FO:d=0.4[v];[1:a]adelay=600|600,apad,aformat=sample_rates=44100:channel_layouts=stereo[a]" \
    -map "[v]" -map "[a]" -t $T -r 30 -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k seg/$i.mp4
  echo "file '$i.mp4'" >> $LIST
done
ffmpeg -loglevel error -y -f concat -safe 0 -i $LIST -c copy -movflags +faststart Gran-Viaje-presentacion.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 Gran-Viaje-presentacion.mp4
