#!/usr/bin/env bash
# Cuts the Studio and Worth channel clips, and their posters, from the films on this
# machine into public/media/. The Pathwise clip is recorded by record-pathwise.mjs.
#
#   bash scripts/media/cut-clips.sh
#
# Every clip is 7.00 s (210 frames), 1280 wide, 30 fps, H.264 yuv420p, silent, with
# the moov atom up front. The last moments of each clip cross-fade into its own first
# frame, so the loop on the page has no jump.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/public/media"

STUDIO_SRC="${STUDIO_SRC:-$HOME/studio-launch-video/cuts/cut-v1.mp4}"
WORTH_SRC="${WORTH_SRC:-$HOME/worth/workspace/videoInspiration/production/v5/final/worth-demo-1080p.mp4}"

LENGTH=7

# The encoder settings shared with record-pathwise.mjs. Keep the two in step.
ENCODE=(
  -c:v libx264 -preset veryslow -crf 18 -maxrate 1500k -bufsize 3000k
  -profile:v high -level:v 4.0 -pix_fmt yuv420p -r 30
  -color_primaries bt709 -color_trc bt709 -colorspace bt709
  -an -movflags +faststart
)

# cut NAME SOURCE IN PLAY FADE POSTER_AT
#   IN         where the clip starts in the source, in seconds
#   PLAY       how many seconds of the source play; if this is under 7 s the last
#              frame is held to make up the rest
#   FADE       length of the closing cross-fade back to the first frame
#   POSTER_AT  the source time of the still used as the poster
cut() {
  local name="$1" src="$2" in="$3" play="$4" fade="$5" poster_at="$6"
  local hold fade_from
  hold="$(awk -v l="$LENGTH" -v p="$play" 'BEGIN { h = l - p; print (h > 0 ? h : 0) }')"
  fade_from="$(awk -v l="$LENGTH" -v f="$fade" 'BEGIN { print l - f }')"

  [ -f "$src" ] || { echo "missing source: $src" >&2; exit 1; }

  ffmpeg -hide_banner -loglevel error -y -ss "$in" -t "$play" -i "$src" \
    -filter_complex "
      [0:v]fps=30,scale=1280:-2:flags=lanczos,format=yuv420p,settb=AVTB,
           tpad=stop_mode=clone:stop_duration=${hold},split[main][copy];
      [copy]trim=end_frame=1,tpad=stop_mode=clone:stop_duration=1,settb=AVTB[first];
      [main][first]xfade=transition=fade:duration=${fade}:offset=${fade_from},
           trim=duration=${LENGTH},setpts=PTS-STARTPTS[v]" \
    -map "[v]" -frames:v "$((LENGTH * 30))" "${ENCODE[@]}" "$OUT/$name.mp4"

  ffmpeg -hide_banner -loglevel error -y -ss "$poster_at" -i "$src" -frames:v 1 \
    -vf "scale=1280:-2:flags=lanczos" -q:v 4 -update 1 "$OUT/$name.jpg"

  echo "wrote $name.mp4 and $name.jpg"
}

mkdir -p "$OUT"

# Studio, scene 6 of the launch film: "Same look. Every video."
# Starts once the three phone frames have landed (27.85), the headline writes itself
# in, a blue line traces what the three shorts share, and all three cut to the same
# end card. The scene starts to collapse at 33.4, so the source stops at 33.35 and the
# end card is held for the rest. Poster: headline, three shorts and the trace.
cut studio "$STUDIO_SRC" 27.85 5.50 0.45 30.00

# Worth, the end of scene 1: the balance going from $2,540 to what is really free.
# Starts with $2,540 and the bar part-claimed (19.90), the cushion takes the last
# piece, the label changes to "what's really his to spend", the number counts down
# to $872.26 and the $1,899 camera no longer fits. Poster: the $872.26 frame.
cut worth "$WORTH_SRC" 19.90 7.00 0.25 26.50
