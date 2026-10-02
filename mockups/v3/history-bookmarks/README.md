# History bookmarks

Open [the comparison](index.html) to try three isolated alternatives:

1. **Corner bookmark** — reveal a 14px bookmark on hover or keyboard focus; a gold bookmark stays visible once selected. Recommended for the least extra visual weight.
2. **Edge pin** — keep a quiet pin beside each thumbnail, preserving the full map preview. More discoverable, with a slightly wider action area.
3. **Snapshot actions** — reveal direct download and bookmark icons on hover or keyboard focus. Download sits at the lower right, replacing the ellipsis; bookmark sits at the upper right and remains gold when selected.

Each action is independent of restoring the snapshot. Thumbnails remain small, borderless and newest-first, with the existing lower fade. The 24px action target is larger than its glyph. Keyboard focus reveals controls; Tab reaches each action independently.

These pages use prepared maps and session-only flags. Bookmark persistence and protection from the 100-snapshot eviction limit are proposals for a later approved implementation. Production history is untouched. The download action uses the existing map writer and placement validation.
