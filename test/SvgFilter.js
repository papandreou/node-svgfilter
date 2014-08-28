/* global describe, it */
var expect = require('unexpected'),
    SvgFilter = require('../lib/SvgFilter'),
    Path = require('path'),
    fs = require('fs');

describe('SvgFilter', function () {
    it('should produce a smaller file when exporting only a specific ID', function (done) {
        var svgFilter = new SvgFilter({keepId: ['linearGradient3175']}),
            chunks = [];
        fs.createReadStream(Path.resolve(__dirname, 'data', 'dialog-information.svg'))
            .pipe(svgFilter)
            .on('data', function (chunk) {
                chunks.push(chunk);
            })
            .on('end', function () {
                var resultSvgBuffer = Buffer.concat(chunks);
                expect(resultSvgBuffer.length, 'to be greater than', 0);
                expect(resultSvgBuffer.length, 'to be less than', 38289);
                var resultSvgText = resultSvgBuffer.toString('utf-8');
                expect(resultSvgText, 'to match', /id="linearGradient3175"/);
                expect(resultSvgText, 'not to match', /id="linearGradient2399"/);
                done();
            })
            .on('error', done);
    });

    it('should produce a smaller file when exporting only a specific ID, command-line argument style', function (done) {
        var svgFilter = new SvgFilter(['--keepId=linearGradient3175']),
            chunks = [];
        fs.createReadStream(Path.resolve(__dirname, 'data', 'dialog-information.svg'))
            .pipe(svgFilter)
            .on('data', function (chunk) {
                chunks.push(chunk);
            })
            .on('end', function () {
                var resultSvgBuffer = Buffer.concat(chunks);
                expect(resultSvgBuffer.length, 'to be greater than', 0);
                expect(resultSvgBuffer.length, 'to be less than', 38292);
                var resultSvgText = resultSvgBuffer.toString('utf-8');
                expect(resultSvgText, 'to match', /id="linearGradient3175"/);
                expect(resultSvgText, 'not to match', /id="linearGradient2399"/);
                done();
            })
            .on('error', done);
    });

    it('should execute inline JavaScript with the specified id', function (done) {
        var svgFilter = new SvgFilter({runScript: 'run', injectId: 'theId'}),
            chunks = [];
        fs.createReadStream(Path.resolve(__dirname, 'data', 'svg-with-script.svg'))
            .pipe(svgFilter)
            .on('data', function (chunk) {
                chunks.push(chunk);
            })
            .on('end', function () {
                var resultSvgText = Buffer.concat(chunks).toString('utf-8');
                expect(resultSvgText, 'to match', /id="theId"/);
                done();
            })
            .on('error', done);
    });

    it('should execute external JavaScript with the specified file name', function (done) {
        var svgFilter = new SvgFilter({
                runScript: 'addBogusElement.js',
                url: 'file://' + __dirname + '/data/',
                bogusElementId: 'theBogusElementId'
            }),
            chunks = [];
        fs.createReadStream(Path.resolve(__dirname, 'data', 'dialog-information.svg'))
            .pipe(svgFilter)
            .on('data', function (chunk) {
                chunks.push(chunk);
            })
            .on('end', function () {
                var resultSvgText = Buffer.concat(chunks).toString('utf-8');
                expect(resultSvgText, 'to match', /id="theBogusElementId"/);
                done();
            })
            .on('error', done);
    });

    it('should not emit data events while paused', function (done) {
        var svgFilter = new SvgFilter();

        function fail() {
            done(new Error('SvgFilter emitted data while it was paused!'));
        }
        svgFilter.pause();
        svgFilter.on('data', fail).on('error', done);

        fs.createReadStream(Path.resolve(__dirname, 'data', 'dialog-information.svg')).pipe(svgFilter);

        setTimeout(function () {
            svgFilter.removeListener('data', fail);
            var chunks = [];

            svgFilter
                .on('data', function (chunk) {
                    chunks.push(chunk);
                })
                .on('end', function () {
                    var resultSvgBuffer = Buffer.concat(chunks);
                    expect(resultSvgBuffer.length, 'to equal', 38289);
                    done();
                });

            svgFilter.resume();
        }, 1000);
    });

    it('should emit an error if an invalid image is processed', function (done) {
        var svgFilter = new SvgFilter();

        svgFilter.on('error', function (err) {
            done();
        }).on('data', function (chunk) {
            done(new Error('SvgFilter emitted data when an error was expected'));
        }).on('end', function () {
            done(new Error('SvgFilter emitted end when an error was expected'));
        });

        svgFilter.end(new Buffer('<?img attr="<>&"/>', 'utf-8'));
    });
});
