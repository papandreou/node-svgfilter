node-svgfilter
==============

A readable/writable stream that manipulates SVG files. Currently it
only supports removing elements whose `id` attribute isn't on a
whitelist. This is useful as a preprocessor to `inkscape` that only
supports a single `--export-id=...` argument.

Example:

```javascript
var SvgFilter = require('svgfilter'),
    fs = require('fs');

fs.createReadStream('source.svg')
    .pipe(new SvgFilter({keepId: ['foo', 'bar']}))
    .pipe(fs.createWriteStream('target.svg'));
```

License
-------

3-clause BSD license -- see the `LICENSE` file for details.
