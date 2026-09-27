# Blockbound

Blockbound is a small, browser-based voxel sandbox. It generates a blocky island with rolling ground, trees, drifting clouds, a day-to-night cycle, and a first-person view. Explore, mine the landscape, and place blocks from your six-slot hotbar.

## Play

Serve this folder with any static web server, then open the address it prints. For example:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in a desktop browser and choose **Enter the world**. The game loads Three.js from jsDelivr and uses Google Fonts, so the first load needs an internet connection.

## Controls

| Input | Action |
| --- | --- |
| W / A / S / D | Walk |
| Mouse | Look around |
| Space | Jump |
| Shift | Move faster |
| Left click | Mine the block under the crosshair |
| Right click | Place the selected block |
| 1–6 or mouse wheel | Select a block |
| Esc | Pause or resume |

The block supply is unlimited, and the world is local to the browser session.
