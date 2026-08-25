# Release checklist

CI proves the logic. Only this checklist proves the live path. Run it against x.com
in a logged-in profile before every release.

1. Load `dist/chrome-mv3` unpacked. Open x.com/home.
2. In the page console, read `Object.hasOwn(window.fetch, 'toString')`. It is `true`.
   The interceptor hides itself from a page that probes it, so `window.fetch.toString()`
   reports the native source either way; the own `toString` is what the patch adds.
   `false` means the main-world script never installed the interceptor, and no post is read.
3. Scroll a little, then open the side panel from the toolbar icon. The panel reads its
   counters once, when it opens, not continuously, so `Posts seen` shows what happened
   before you opened it, not what happens afterward.
4. Enable Diagnostics and turn on "Explain every post". Every paired cell carries
   `data-xmt-label="graphql"` or `data-xmt-label="dom"`. A `dom` label is the fallback
   record the adapter builds from the markup 1.5 s after a cell arrives with no GraphQL
   response of its own, which is how X renders a cell from its own cache. On a fresh
   scroll almost every label reads `graphql`; a timeline of only `dom` labels means the
   interceptor reads nothing, so check step 2 again.
5. Scroll 200 posts, then close and reopen the panel for a fresh reading (see step 3):
   `Posts seen` is higher than before, and the timeline does not stutter while you scroll.
6. Open a post, then close and reopen the panel for a fresh reading (see step 3). Go
   back and do the same. Open a profile and do the same again: each fresh reading shows
   a higher `Posts seen` count.
7. On a route that renders posts, close and reopen the panel for a fresh reading, then
   check Settings → Selector health: every entry reads `ok`. The `dom:cell` sample is
   taken only on such a route, so it stays unsampled anywhere else.
8. Turn Diagnostics off, then reload the page. No cell carries a `data-xmt`
   attribute. Cells tagged before the toggle keep their attributes until reload:
   turning a tool off does not re-scan or re-verdict cells already on screen.
9. Export the config, import it into a clean profile, and confirm the toggles match.
10. Confirm in DevTools → Network that the extension made no request to any host but x.com.
11. Repeat steps 1 to 9 in the Firefox build, loaded from `dist/firefox-mv3`.
12. Push the tag as `vX.Y.Z`. The release workflow strips the leading `v` and writes the
    rest into `package.json` before it builds, so the zips are named
    `xmultitool-X.Y.Z-*.zip`. `package.json` stays at `0.0.0` in the repository, and a
    tag that is not one to four dot-separated numbers fails the job.

Record the X web app build number from the page source next to the date. When a
fixture stops matching, that number tells you which release changed the shape.
