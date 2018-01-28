/*global describe, it, __dirname, setTimeout*/
const expect = require('unexpected').clone().installPlugin(require('unexpected-stream'));
const SvgFilter = require('../lib/SvgFilter');
const Path = require('path');
const fs = require('fs');

describe('SvgFilter', function () {
    it('should produce a smaller file when exporting only a specific ID', async function () {
        await expect(
            fs.createReadStream(Path.resolve(__dirname, 'data', 'dialog-information.svg')),
            'when piped through',
            new SvgFilter({keepId: ['linearGradient3175']}),
            'to yield output satisfying',
            'when decoded as', 'utf-8',
            expect.it('to contain', 'id="linearGradient3175"')
                .and('not to contain', 'id="linearGradient2399"')
        );
    });

    it('should produce a smaller file when exporting only a specific ID, command-line argument style', async function () {
        await expect(
            fs.createReadStream(Path.resolve(__dirname, 'data', 'dialog-information.svg')),
            'when piped through',
            new SvgFilter(['--keepId=linearGradient3175']),
            'to yield output satisfying',
            'when decoded as', 'utf-8',
            expect.it('to contain', 'id="linearGradient3175"')
                .and('not to contain', 'id="linearGradient2399"')
        );
    });

    it('should execute inline JavaScript with the specified id', async function () {
        await expect(
            fs.createReadStream(Path.resolve(__dirname, 'data', 'svg-with-script.svg')),
            'when piped through',
            new SvgFilter({runScript: 'run', injectId: 'theId'}),
            'to yield output satisfying',
            'when decoded as', 'utf-8',
            'to contain', 'id="theId"'
        );
    });

    it('should execute external JavaScript with the specified file name', async function () {
        await expect(
            fs.createReadStream(Path.resolve(__dirname, 'data', 'dialog-information.svg')),
            'when piped through',
            new SvgFilter({
                runScript: 'addBogusElement.js',
                url: 'file://' + __dirname + '/data/',
                bogusElementId: 'theBogusElementId'
            }),
            'to yield output satisfying',
            'when decoded as', 'utf-8',
            'to contain', 'id="theBogusElementId"'
        );
    });

    it('should not emit data events while paused', function (done) {
        const svgFilter = new SvgFilter();

        function fail() {
            done(new Error('SvgFilter emitted data while it was paused!'));
        }
        svgFilter.pause();
        svgFilter.on('data', fail).on('error', done);

        fs.createReadStream(Path.resolve(__dirname, 'data', 'dialog-information.svg')).pipe(svgFilter);

        setTimeout(function () {
            svgFilter.removeListener('data', fail);
            const chunks = [];

            svgFilter
                .on('data', chunk => chunks.push(chunk))
                .on('end', () => {
                    const resultSvgBuffer = Buffer.concat(chunks);
                    expect(resultSvgBuffer.length, 'to equal', 38291);
                    done();
                });

            svgFilter.resume();
        }, 1000);
    });

    it('should emit an error if an invalid image is processed', function (done) {
        const svgFilter = new SvgFilter();

        svgFilter.on('error', err => {
            expect(err, 'to have message', /Parse error/);
            done();
        })
            .on('data', chunk => done(new Error('SvgFilter emitted data when an error was expected')))
            .on('end', () => done(new Error('SvgFilter emitted end when an error was expected')));

        svgFilter.end(new Buffer('<?img attr="<>&"/>', 'utf-8'));
    });
});
