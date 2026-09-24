# The real Imaan's Shoes layout

Measured from the owner's existing 3-D store, `imaans-shoe-store.zip` (a built Vite site). Sources inside it:
- the fixture plan in `assets/index-*.js` (`interior`, `partitionAt`, and a fixture list with sizes, walls and
  product counts, drawn from the owner's paper floor plan)
- world bounding boxes of every node in `assets/baked/chunk_{shell,fixtures,props}.glb`, read from the glTF
  accessor min/max values and node transforms
- the posters in `assets/posters/`, which confirm which side each fixture is on

The bounding boxes and the plan agree to within 1 cm.

## Frame

Everything below uses **this repo's frame**: metres, Y up, floor at 0, the viewer walks in toward **−z**, and
**+x is on the viewer's right**. The old store used a different frame, so convert with
`x = −x_old`, `z = 4.4 − z_old`. That is a 180° turn, not a mirror.

## Room

| | value |
|---|---|
| Interior (wall faces) | **4.90 m wide × 8.80 m deep × 3.00 m high**: x −2.45…2.45, z −4.40…4.40 |
| Shop floor (public) | z −2.20…4.40, so **4.90 × 6.60 m ≈ 32 m²** |
| Back partition | front face z −2.20, 0.12 m thick, dark vertical-fluted panel |
| Storeroom | z −4.40…−2.32 (2.08 m deep), behind the staff door |
| Walls | 0.12 m. Warm ivory panels 1.2 m wide in two rows, split at 0.64 of the height, with a 0.10 m black skirting |
| Ceiling | 3.00 m. A bulkhead drops to 2.66 m over the first 1.5 m inside the glass (z 2.9…4.4) |
| Floor | light marble, polished |

## Storefront (z = +4.40)

| Fixture | x from…to | Size W × H | Notes |
|---|---|---|---|
| Window, left | −2.35…−1.05 | 1.30 × 2.60 | glass, transom bar at 1.84 m |
| Door leaf, left | −0.95…−0.05 | 0.90 × 2.40 | glass, black frame, vertical bar handle |
| Door leaf, right | 0.05…0.95 | 0.90 × 2.40 | the entrance is 1.90 m clear |
| Window, right | 1.05…2.35 | 1.30 × 2.60 | |
| Piers | ±1.00, ±2.40 | 0.10 wide | black metal; head from 2.60 to 3.00 m |
| Fascia + logo (outside) | −2.57…2.57 | 5.14 × 1.70 (y 2.6…4.3) | lit logo 1.86 × 1.20 centred at y 3.5 |

## Fixtures

Centre (x, z), size **W** (along the wall) × **D** (out from the wall) × **H**. Left-wall pieces face +x, right-wall
pieces face −x, and partition pieces face +z (toward the door).

| # | Fixture | Wall | Centre x, z | W × D × H | Holds (old store) |
|---|---|---|---|---|---|
| 1 | Window mannequin A | left window | −1.70, 3.78 | 0.70 × 0.68 × 1.78 | 1 outfit |
| 2 | Window mannequin B | left window | −1.10, 3.90 | 0.60 × 0.55 × 1.78 | 1 outfit |
| 3 | **Shoe wall 1** | left | −2.27, 3.21 | 1.85 × 0.36 × 2.55 | 9 lit tiers × 4 = **36 shoes** |
| 4 | **Display step 1** | left | −2.05, 1.53 | 0.80 × 0.80 × 0.75 | 3 steps × 2 = **6 shoes** |
| 5 | **Shoe wall 2** | left | −2.27, −0.22 | 2.00 × 0.36 × 2.55 | 9 × 4 = **36 shoes** |
| 6 | Sculpture plinth | left, back corner | −1.73, −1.25 | 0.70 × 0.36 × 0.38 | 3 small sculptures |
| 7 | Small plant | left, back corner | −2.13, −1.70 | Ø 0.34, 1.42 tall | |
| 8 | **Counter** | right, by the door | 2.12, 3.34 | 1.60 × 0.65 × 1.05 (top 0.71 deep) | till and card machine, accessories on top; front corner chamfered 0.45 |
| 9 | 3 pendant lights | over the counter | 2.13, 2.73…3.95 | hang down to 1.90 m | |
| 10 | Logo panel | right wall | 2.42, 2.40 | 1.11 × 0.72, y 1.69…2.41 | |
| 11 | **Clothing rail** | right | 2.15, 1.48 | 1.45 × 0.60 × 2.30 | **14 garments** hanging |
| 12 | **Display step 2** | right | 2.10, 0.12 | 0.70 × 0.70 × 0.75 | 3 × 2 = **6** |
| 13 | **Folded shelves** | right | 2.23, −1.02 | 1.05 × 0.45 × 2.30 | 5 shelves × 5 = **25** folded items and accessories |
| 14 | Tall plant | right, back corner | 1.92, −1.41 | Ø 0.50, 2.44 tall | |
| 15 | **Bench** | centre | 0.20, 1.28 | 1.20 × 0.90 × 0.45 | black leather cushions |
| 16 | **Glass island** | centre | 0.20, 0.00 | 0.70 × 1.40 (long axis front to back) × 0.80 | glass top, 2 tiers × 5 = **10 shoes**; light panel above |
| 17 | Staff door | partition | −1.87, −2.20 | 0.80 × 2.10 | closed |
| 18 | **Narrow shoe shelf** | partition | −0.88, −2.02 | 0.70 × 0.36 × 2.30 | 8 × 2 = **16 shoes** |
| 19 | **Mirror** | partition | 0.27, −2.20 | 1.10 × 2.10, bottom at 0.25 | LED halo |
| 20 | **Short clothing rail** | partition | 1.43, −2.00 | 0.70 × 0.40 × 2.30 | **6 garments** |
| 21 | Floor uplight strip | along the partition | x −1.8…1.8, z −2.04 | | |
| 22 | Storage shelves | storeroom | 0.73, −2.55 | 2.80 × 0.45 × 2.20 | 6 bays of boxes |
| 23 | Sink | storeroom, back wall | 1.76, −4.13 | 0.90 × 0.55 × 0.90 | |

**Display slots:** 110 for shoes (36 + 36 + 16 + 10 + 6 + 6), 20 hanging garments and 2 mannequins, 25 shelf
spots, and the counter top.

## Lighting

- Two black ceiling tracks run front to back at x ≈ ±1.37, with spots at z ≈ 3.05, 1.45, −0.15 and −1.55. A
  centre row of spots is offset 0.8 m back from those.
- A rectangular light panel sits over the island, at x −0.15…0.55, z −0.6…0.6.
- Warm LED coves run along both side walls and the back wall at the ceiling line. Every shelf lip has a warm LED
  strip, and each wall unit has a pelmet LED.
- Three pendants hang over the counter. A floor uplight strip runs along the partition.

## Colours and materials

| Surface | Old store |
|---|---|
| Walls | warm ivory panels, black metal skirting |
| Floor | light polished marble |
| Wall units and shelves | dark espresso/bronze wood (#5a5650 tint, textured) with warm LED lips |
| Counter, steps, island body | ivory (#f1ede7), satin |
| Island top, trims, tracks, frames | black metal (#1d1d20) and glass |
| Partition | dark vertical flutes |
| Bench | black leather (#19191b) |
| Accents | gold (#d3a54b) on the logo and sculptures |

## Camera and walking

- **Old store:** a scroll-driven walk with no free roaming. It starts on the pavement about 3.3 m outside the glass
  (z ≈ 7.7), looking up at the sign, then goes in through the right-hand door leaf. It makes 10 stops: arrival,
  shoe wall, display step, down the shop, clothing wall, island, mirror, folded shelves, back toward the front,
  and the counter. Every fixture and wall is a collider.
- **New store (agreed with the owner, 2026-09-23):** keep the old start: on the pavement at (0, 1.62, 7.74),
  looking up at the fascia sign (0, 2.18, 4.4). The walkable area is the pavement strip in front of the shop,
  the 1.90 m door opening, and the shop floor (x ±2.45, z −2.2…4.4, radius 0.28), with every fixture as a
  collider. The staff door stays shut and the storeroom is not built, because nobody could see it.
- **Approved by the owner:** this layout, and display step 2 holding accessories.

## Fitting the 86 products (29 shoes, 29 clothes, 28 accessories)

| Group | Where | Capacity |
|---|---|---|
| Shoes 29 | shoe walls 1 and 2, narrow shoe shelf, glass island, display step 1 | 104 slots, so every shoe gets a spot; the rest are filled with repeat colourways |
| Clothes 29 | clothing rail 14, short rail 6, 2 mannequins, 2 shelves of the folded unit (10) | 32 |
| Accessories 28 | counter top (about 10 small pieces), 3 shelves of the folded unit (15), display step 2 (6) | 31 |

All 86 fit. The one change from the old store: display step 2 holds accessories instead of shoes, because it
sits on the clothing side next to the folded shelves.
