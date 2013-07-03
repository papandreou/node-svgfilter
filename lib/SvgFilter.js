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
    while (!this.hasEnded && !this.isPaused && this.outgoingChunks.length > 0) {
        var outgoingChunk = this.outgoingChunks.shift();
        if (outgoingChunk === null) {
            this.hasEnded = true;
            this.emit('end');
        } else {
            this.emit('data', outgoingChunk);
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
        reportError = function (e) {
            this.emit('error', e);
            this.hasEnded = true;
        }.bind(this);

    assetGraph
        .on('error', reportError)
        .loadAssets({
            type: 'Svg',
            url: this.options.url || assetGraph.root + 'fakeFileName.svg',
            rawSrc: Buffer.concat(this.incomingChunks).toString('utf-8')
        })
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

                assetGraph.findRelations({from: svgAsset, type: 'SvgScript'}).forEach(function (svgScript) {
                    if (this.options.runScript === true || runScriptIds.indexOf(svgScript.node.getAttribute('id')) !== -1) {
                        var javaScript = svgScript.to,
                            fileName = javaScript.nonInlineAncestor.url;
                        try {
                            new vm.Script(javaScript.text, fileName).runInContext(context);
                        } catch (e) {
                            reportError(e);
                        }
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
