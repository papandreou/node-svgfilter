var DOMParser = require('xmldom').DOMParser,
    Stream = require('stream').Stream,
    util = require('util'),
    optimist = require('optimist');

function SvgFilter(options) {
    Stream.call(this);

    if (Array.isArray(options)) {
        this.options = optimist(options).argv;
    } else {
        this.options = options || {};
    }

console.warn("\n\nthis.options", this.options);

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
    var xmlText = Buffer.concat(this.incomingChunks).toString('utf-8'),
        document,
        reportParseError = function (e) {
            this.emit('error', e);
            this.hasEnded = true;
            document = null;
        }.bind(this);

    var firstParseError,
        domParser = new DOMParser({
            errorHandler: function (err) {
                firstParseError = firstParseError || err;
            }
        });

    document = domParser.parseFromString(xmlText, 'text/xml');

    if (firstParseError) {
        reportParseError(firstParseError);
    } else if (document && (!document.documentElement || document.documentElement.nodeName !== 'svg')) {
        reportParseError(new Error('non-SVG document'));
    }

    if (document) {
        // Workaround for https://github.com/jindw/xmldom/pull/59
        function fixUpDocTypeNode(doctypeNode) {
            if (!doctypeNode || doctypeNode.nodeType !== 10) {
                return;
            }
            ['publicId', 'systemId'].forEach(function (doctypePropertyName) {
                if (doctypeNode[doctypePropertyName]) {
                    doctypeNode[doctypePropertyName] = doctypeNode[doctypePropertyName].replace(/"/g, '');
                }
            });
        }
        fixUpDocTypeNode(document.doctype);
        for (var i = 0 ; i < document.childNodes.length ; i += 1) {
            fixUpDocTypeNode(document.childNodes[i]);
        }
        var options = this.options;
        if (options.keepId) {
            var keepIds = Array.isArray(options.keepId) ? options.keepId : [options.keepId];
            (function traverse(node) {
                var type = node.nodeType,
                    id = node.getAttribute && node.getAttribute('id');
                if (id && keepIds.indexOf(id) !== -1) {
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
        this.outgoingChunks.push(new Buffer(document.toString(), 'utf-8'), null);
        this._proceed();
    }
};

SvgFilter.prototype.pause = function () {
    this.isPaused = true;
};

SvgFilter.prototype.resume = function () {
    this.isPaused = false;
    this._proceed();
};

module.exports = SvgFilter;
