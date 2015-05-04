var Stream = require('stream').Stream,
    vm = require('vm'),
    util = require('util'),
    AssetGraph = require('assetgraph'),
    optimist = require('optimist'),
    passError = require('passerror');

function arrayify(value) {
    if (Array.isArray(value)) {
        return value;
    } else if (typeof value === 'undefined') {
        return [];
    } else {
        return [value];
    }
}

function SvgFilter(options) {
    Stream.call(this);

    if (Array.isArray(options)) {
        this.options = optimist(options).argv;
    } else {
        this.options = options || {};
    }

    this.writable = this.readable = true;
    this.incomingChunks = [];
    this.outgoingChunks = [];
    this.hasEnded = false;
    this.isPaused = false;
}

util.inherits(SvgFilter, Stream);

SvgFilter.prototype._proceed = function () {
    if (!this.hasEnded && !this.isPaused && this.outgoingChunks.length > 0) {
        var outgoingChunk = this.outgoingChunks.shift();
        if (outgoingChunk === null) {
            this.hasEnded = true;
            this.emit('end');
        } else {
            this.emit('data', outgoingChunk);
            setImmediate(function () {
                this._proceed();
            }.bind(this));
        }
    }
};

SvgFilter.prototype.write = function (chunk) {
    this.incomingChunks.push(chunk);
};

SvgFilter.prototype.end = function (chunk) {
    if (chunk) {
        this.write(chunk);
    }
    var root = this.options.root || 'file:///fakepath/',
        assetGraph = new AssetGraph({root: root}),
        svgAssetUrl = this.options.url || assetGraph.root + 'fakeFileName.svg',
        reportError = function (err) {
            if (!this.hasEnded) {
                this.emit('error', err);
            }
            this.hasEnded = true;
        }.bind(this),
        externalScriptFileNamesToRun = arrayify(this.options.runScript).filter(function (externalScriptFileNameOrScriptId) {
            return /\.js$/.test(externalScriptFileNameOrScriptId);
        }),
        assetConfigsToLoad = [
            {
                type: 'Svg',
                url: svgAssetUrl,
                rawSrc: Buffer.concat(this.incomingChunks).toString('utf-8')
            }
        ].concat(
            externalScriptFileNamesToRun.map(function (scriptFileName) {
                return {
                    scriptFileName: scriptFileName,
                    url: assetGraph.resolveUrl(svgAssetUrl, scriptFileName)
                };
            })
        );

    if (externalScriptFileNamesToRun.length > 0 && !this.options.url) {
        return reportError(new Error('options.url is mandatory when runScript refers to external scripts (has a .js extension)'));
    }

    assetGraph
        .on('error', reportError)
        .on('warn', reportError)
        .loadAssets(assetConfigsToLoad)
        .populate()
        .run(passError(reportError, function (assetGraph) {
            var svgAsset = assetGraph.findAssets({isInitial: true})[0],
                document = svgAsset.parseTree;

            if (this.options.keepId) {
                var keepIds = arrayify(this.options.keepId),
                    removeDisplayNone = this.options.removeDisplayNone;
                (function traverse(node) {
                    var type = node.nodeType,
                        id = node.getAttribute && node.getAttribute('id');
                    if (id && keepIds.indexOf(id) !== -1) {
                        if (removeDisplayNone && node.hasAttribute('display') && node.getAttribute('display') === 'none') {
                            node.removeAttribute('display');
                        }
                        return true;
                    } else if (node.childNodes) {
                        var keep = type !== 1; // Non-element node
                        for (var i = 0 ; i < node.childNodes.length ; i += 1) {
                            if (traverse(node.childNodes[i])) {
                                keep = true;
                            }
                        }

                        // Don't throw away the <svg> element, even if it has an id attribute that's not specified by options.keepId:
                        if (node.nodeName && node.nodeName.toLowerCase() === 'svg') {
                            keep = true;
                        }

                        if (!keep) {
                            node.parentNode.removeChild(node);
                        }
                        return keep;
                    }
                }(document));
            }
            if (this.options.runScript) {
                var runScriptIds = arrayify(this.options.runScript),
                    context = vm.createContext({
                        assetGraph: assetGraph,
                        console: console,
                        svgFilter: this.options,
                        document: document
                    });
                context.window = context;

                function runJavaScriptAsset(javaScript) {
                    var fileName = javaScript.nonInlineAncestor.url;
                    try {
                        new vm.Script(javaScript.text, fileName).runInContext(context);
                    } catch (e) {
                        reportError(e);
                    }
                }

                assetGraph.findRelations({from: svgAsset, type: 'SvgScript'}).forEach(function (svgScript) {
                    if (this.options.runScript === true || runScriptIds.indexOf(svgScript.node.getAttribute('id')) !== -1) {
                        runJavaScriptAsset(svgScript.to);
                    }
                }, this);

                externalScriptFileNamesToRun.forEach(function (scriptFileName) {
                    var javaScripts = assetGraph.findAssets({scriptFileName: scriptFileName, isLoaded: true});
                    if (javaScripts.length === 1) {
                        var javaScript = javaScripts[0];
                        this.emit('etagFragment', javaScript.md5Hex);
                        runJavaScriptAsset(javaScript);
                    } else {
                        reportError(new Error('Unexpected number of JavaScript assets found for ' + scriptFileName + ': ' + javaScripts.length));
                    }
                }, this);

            }
            svgAsset.markDirty();
            this.outgoingChunks.push(svgAsset.rawSrc, null);
            this._proceed();
        }).bind(this));
};

SvgFilter.prototype.pause = function () {
    this.isPaused = true;
};

SvgFilter.prototype.resume = function () {
    this.isPaused = false;
    this._proceed();
};

module.exports = SvgFilter;
