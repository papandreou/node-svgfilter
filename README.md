node-svgfilter
==============

A readable/writable stream that manipulates SVG files. The primary use
case is removing elements whose `id` attribute isn't on a
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

As an experimental feature you can run inline JavaScript found in the
SVG file itself by specifying the `runScripts` option. The JavaScript
can manipulate the SVG DOM however it wants through the `document`
global. The script also has access to the globals `console`, `window`,
and `svgFilter`. The latter is the options object passed to the
SvgFilter constructor, so it's possible to carry out specific
instructions, eg. change the color of an icon.

Given `blackCircle.svg`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns:svg="http://www.w3.org/2000/svg" height="48px" width="48px">
    <circle id="theCircle" cx="100" cy="50" r="40" stroke="black" />
    <script>
        document.getElementById('theCircle').setAttribute('stroke', svgFilter.circleColor);
    </script>
</svg>
```

```javascript
var SvgFilter = require('svgfilter'),
    fs = require('fs');

require('fs').createReadStream('blackCircle.svg')
    .pipe(new SvgFilter({runScript: true, circleColor: 'maroon'}))
    .pipe(process.stdout);
```

This will produce an SVG file where the `stroke` attribute of the
circle element has been changed to `maroon`. The `runScript` option
can also specify the id of the script to run, or an array of ids.


License
-------

3-clause BSD license -- see the `LICENSE` file for details.
