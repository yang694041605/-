# Media licenses

The project owner confirmed the right to redistribute the following included media and selected the repository's [MIT License](LICENSE) for them on 2026-10-10. Preserve that copyright and license notice when redistributing these assets. The scope is the included template/demo files, not user material or third-party dependencies.

| Media | Provenance | Distribution status |
|---|---|---|
| `kits/remotion/public/assets/xy62/` | Doodle artwork, paper backgrounds and baked lettering | MIT |
| `kits/remotion/public/assets/dvstory/` | DV Story stickers, filmstrip and textures | MIT |
| `kits/remotion/public/assets/xy39/*-gold.png` | Gold paper-cut lantern, medallion, window ring, clouds and corner from the owner's paper-cut template artwork | MIT |
| `kits/remotion/public/photos/` | 84 fictional demonstration photos and 19 fictional DV Story demo photos (`dvdemo-*`); hashes in `assets.json` | MIT; not records of real people or events |
| `kits/remotion/public/sfx/dvstory-key-*.wav` | Key taps synthesized by `scripts/make-key-sfx.py` | MIT |
| `kits/remotion/public/music/maple-leaf-rag.ogg` | Scott Joplin, *Maple Leaf Rag* (1899), recording by Gnissah via Wikimedia Commons | Public domain |
| `kits/remotion/public/music/*.beats.json`, `sources.json` | Beat analysis and track records; Mixkit audio itself is **not** included | MIT |
| `docs/assets/*.jpg`, `docs/assets/*.mp4` | Full-length template renders and their posters, using the demo media above | Picture MIT; soundtrack as below |
| `docs/assets/loops/*.webp` | Silent 4-second loops cut from those previews for the README (`album-vertical.webp` frames the 9:16 short in 16:9) | MIT |
| `docs/assets/art/` | Illustrations generated with an image model for vibevision.video, cropped as README banners | MIT |
| `docs/assets/brand/` | VVV logo, vector redraws and promotional illustrations; generation prompts in `generation.json` | MIT |

**Preview soundtracks.** `docs/assets/album.mp4` and `album-vertical.mp4` carry *Skyline* by Eugenio Mininni, `dv-story.mp4` carries *Fifth of February* by Michael Ramir C., `doodle.mp4` carries *Dance with Me* by Ahjay Stelino, and `comedy.mp4` carries *Fun and Games* and *When in Love* by Ahjay Stelino with Mixkit sound effects. They are used under the Mixkit Stock Music and Sound Effects Free Licenses, which permit their use in published videos. `starter.mp4` carries the bundled public-domain *Maple Leaf Rag* recording listed above. You may redistribute the rendered preview videos (including inside a `.vvv` package's `preview/`); the audio itself may not be extracted or redistributed as a separate file. Templates fetch Mixkit tracks into a project with `npm run music`; see [the track list](kits/remotion/public/music/sources.json).

Font files keep their bundled official OFL notices; preserve them and the [font source manifest](kits/remotion/font-sources.json). Third-party code is covered by [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

`.vvv` packages carry a `licenses.json` naming the terms of every file they contain, derived from [package-licenses.json](kits/remotion/package-licenses.json). Template and effect packages refuse any file without a rule or one that may not be redistributed, so Mixkit audio files never enter a package.

New third-party assets need their own source and license evidence. Keep customer and user material out of examples and public test fixtures unless its publication has been explicitly authorized.
