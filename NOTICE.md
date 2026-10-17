# Third-Party Notices

Niracast is released under the MIT License (see `LICENSE`). It uses the
following third-party components, each under its own license.

## FFmpeg / ffprobe
The Docker image installs the Alpine Linux `ffmpeg` package. Niracast only
runs FFmpeg as a separate command-line process; no FFmpeg code is linked into
the Niracast binary. The packaged FFmpeg build is licensed under the GNU GPL
(v2 or later, because it includes GPL components such as libx264). If you
redistribute a container image built from this repository you are responsible
for complying with those terms. Source code: <https://ffmpeg.org/download.html>
and the Alpine aports tree.

## Go dependencies
See `go.mod`. Notable: `modernc.org/sqlite` (BSD-3-Clause),
`golang.org/x/time` (BSD-3-Clause). Run `go list -m all` for the full list.

## Frontend dependencies
See `web/app/package.json`. Notable: `hls.js` (Apache-2.0), React (MIT),
Radix UI (MIT), Tailwind CSS (MIT), TanStack Query (MIT), `motion` (MIT),
`@dnd-kit` (MIT), Lucide icons (ISC).

## Bundled artwork
`assets/filler/siaran_segera_kembali.jpg` ("Siaran Segera Kembali", i.e.
"Broadcast will resume shortly") is an original card created for this project
and dedicated to the public domain under CC0 1.0.

## Content disclaimer
Niracast is software only. It does not provide, host, or distribute any media.
You are solely responsible for having the rights to every file you broadcast.
