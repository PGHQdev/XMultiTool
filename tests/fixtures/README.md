# Fixtures

`home-timeline.json` is synthetic. It matches the shape of X's HomeTimeline response
as of 2026-08. Before each release, capture a real response from a logged-in session,
scrub account data, and add it beside this file. A synthetic fixture proves the
normalizer's logic; only a captured one proves the shape is still current.
