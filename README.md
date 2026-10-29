# Puzzles of Florida's Past

Rotate, Jigsaw, Slide and Survey puzzles made from a mosaic of historical **General Land Office (GLO)
survey plats** of Florida. The site opens into a random Rotate puzzle. Switching the
puzzle type or difficulty rebuilds the current puzzle. **New puzzle** picks another
random place (only squares with no blank pieces), and **Choose on map** lets you pick any; both keep your settings. 

In Jigsaw, pieces click into board squares and stay movable until the whole puzzle is solved. Every mode uses 3×3 (Easy),
4×4 (Medium) or 5×5 (Hard); Survey uses township, half-township and quarter-township pieces.
Gaps in the mosaic show as plain paper. In Slide mode, a missing map tile becomes the empty space.
The **Map** switch picks the picture: **Historical**, **Present** (today's satellite view) or
**Mixed** (about half of each), and can be changed at any time, even mid-puzzle.

Historical maps: [General Land Office survey plats](https://www.labins.org/survey_data/landrecords/landrecords.cfm),
processed by the Florida Museum of Natural History's AI for Human Ecology Lab.

Built with Svelte 5, Vite and TypeScript.

## Survey mode

Pieces are the units of the Public Land Survey System, the township and section lines
the surveyors drew on these plats: **townships** (Easy), **half townships** (Medium) and
**quarter townships** (Hard). The grid comes from the BLM's national PLSS dataset (CadNSDI): every
numbered section's center is used to fit the survey grid as straight lines (with a per-row shift
for the jogs at correction lines).

## Present-day and Mixed views

Switch **Map** to **Present** (in the left panel, on the map page or mid-puzzle) to see and solve
the same 20 km square as it looks today, or to **Mixed** to solve with about half the pieces
historical and half present-day. Switching never changes the puzzle: tiles, pieces, and
moves stay put; only the picture changes.

The present-day images are cloud-free **Sentinel-2** composites of the most recent complete
dry season (November–April), from Microsoft Planetary Computer. Built before app is deployed.

## Credits and license

- Historical maps: [General Land Office survey plats](https://www.labins.org/survey_data/landrecords/landrecords.cfm)
  (Land Boundary Information System, LABINS), processed by the **Florida Museum of Natural History**'s
  AI for Human Ecology Lab. The derived plat images in `public/` are published with permission.
- Present-day imagery: contains modified Copernicus Sentinel data, accessed through
  [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/).
- PLSS survey grid: BLM National PLSS dataset (CadNSDI).
