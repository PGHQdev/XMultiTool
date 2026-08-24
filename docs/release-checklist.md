# Release checklist

CI proves the logic. Only this checklist proves the live path. Run it against x.com
in a logged-in profile before every release.

1. Load `.output/chrome-mv3` unpacked. Open x.com/home.
2. Scroll a little, then open the side panel from the toolbar icon. The panel reads its
   counters once, when it opens, not continuously, so `Posts seen` shows what happened
   before you opened it, not what happens afterward.
3. Enable Diagnostics and turn on "Explain every post". Every paired cell carries
   `data-xmt-label="graphql"`. A `dom` label would mean the adapter started producing
   DOM-sourced records, which this plan's adapter never does.
4. Scroll 200 posts, then close and reopen the panel for a fresh reading (see step 2):
   `Posts seen` is higher than before, and the timeline does not stutter while you scroll.
5. Open a post, then close and reopen the panel for a fresh reading (see step 2). Go
   back and do the same. Open a profile and do the same again: each fresh reading shows
   a higher `Posts seen` count.
6. Close and reopen the panel for a fresh reading, then check Settings → Selector
   health: every entry reads `ok`.
7. Turn Diagnostics off, then reload the page. No cell carries a `data-xmt`
   attribute. Cells tagged before the toggle keep their attributes until reload:
   turning a tool off does not re-scan or re-verdict cells already on screen.
8. Export the config, import it into a clean profile, and confirm the toggles match.
9. Confirm in DevTools → Network that the extension made no request to any host but x.com.
10. Repeat steps 1 to 8 in the Firefox build.

Record the X web app build number from the page source next to the date. When a
fixture stops matching, that number tells you which release changed the shape.
