# Release checklist

CI proves the logic. Only this checklist proves the live path. Run it against x.com
in a logged-in profile before every release.

1. Load `dist/chrome-mv3` unpacked. Open x.com/home.
2. In the page console, read `Object.hasOwn(window.fetch, 'toString')`. It is `true`.
   The interceptor hides itself from a page that probes it, so `window.fetch.toString()`
   reports the native source either way; the own `toString` is what the patch adds.
   `false` means the main-world script never installed the interceptor, and no post is read.
3. Scroll a little, then open the side panel from the toolbar icon. Filter shows the
   dimmed count over the posts read on that tab, and it keeps reading every 2 s while
   the panel stays open.
4. Confirm the built-in rules work on the live timeline: a promoted post fades and
   carries the word `promoted` at its lower right, and hovering it brings it back.
   Add a muted word that appears in the feed, then scroll: the matching posts fade
   with `muted word`, and the count beside the rule rises.
5. Open Settings, enable Diagnostics and turn on "Explain every post". Every paired cell carries
   `data-xmt-label="graphql"` or `data-xmt-label="dom"`. A `dom` label is the fallback
   record the adapter builds from the markup 1.5 s after a cell arrives with no GraphQL
   response of its own, which is how X renders a cell from its own cache. On a fresh
   scroll almost every label reads `graphql`; a timeline of only `dom` labels means the
   interceptor reads nothing, so check step 2 again.
6. Scroll 200 posts: `Posts read` on Activity rises as you go, and the timeline does
   not stutter while you scroll.
7. Open a post, go back, then open a profile. `Posts read` rises on each.
8. On a route that renders posts, check Settings → Selector health: every entry reads
   `ok`. The `dom:cell` sample is taken only on such a route, so it stays unsampled
   anywhere else.
9. Turn Diagnostics off, then reload the page. No cell carries a `data-xmt`
   attribute. Cells tagged before the toggle keep their attributes until reload:
   turning a tool off does not re-scan or re-verdict cells already on screen.
10. Export the config, import it into a clean profile, and confirm the rules match.
11. Confirm in DevTools → Network that the extension made no request to any host but x.com.
12. Repeat steps 1 to 10 in the Firefox build, loaded from `dist/firefox-mv3`.
13. Push the tag as `vX.Y.Z`. The release workflow strips the leading `v` and writes the
    rest into `package.json` before it builds, so the zips are named
    `xmultitool-X.Y.Z-*.zip`. `package.json` stays at `0.0.0` in the repository, and a
    tag that is not one to four dot-separated numbers fails the job.

Record the X web app build number from the page source next to the date. When a
fixture stops matching, that number tells you which release changed the shape.
