const Stream = require('stream').Stream;
const vm = require('vm');
const AssetGraph = require('assetgraph');
const optimist = require('optimist');

function arrayify(value) {
  if (Array.isArray(value)) {
    return value;
  } else if (typeof value === 'undefined') {
    return [];
  } else {
    return [value];
  }
}

function runJavaScriptAsset(javaScript, context, reportError) {
  const fileName = javaScript.nonInlineAncestor.url;
  try {
    new vm.Script(javaScript.text, fileName).runInContext(context);
  } catch (e) {
    reportError(e);
  }
}

class SvgFilter extends Stream {
  constructor(options) {
    super();

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

  _proceed() {
    if (!this.hasEnded && !this.isPaused && this.outgoingChunks.length > 0) {
      const outgoingChunk = this.outgoingChunks.shift();
      if (outgoingChunk === null) {
        this.hasEnded = true;
        this.emit('end');
      } else {
        this.emit('data', outgoingChunk);
        setImmediate(() => {
          this._proceed();
        });
      }
    }
  }

  write(chunk) {
    this.incomingChunks.push(chunk);
  }

  end(chunk) {
    if (chunk) {
      this.write(chunk);
    }
    const root = this.options.root || 'file:///fakepath/';
    const assetGraph = new AssetGraph({ root });
    const svgAssetUrl =
      this.options.url || `${assetGraph.root}fakeFileName.svg`;
    const reportError = err => {
      if (!this.hasEnded) {
        this.emit('error', err);
      }
      this.hasEnded = true;
    };
    const externalScriptFileNamesToRun = arrayify(
      this.options.runScript
    ).filter(externalScriptFileNameOrScriptId =>
      /\.js$/.test(externalScriptFileNameOrScriptId)
    );
    const assetConfigsToLoad = [
      {
        type: 'Svg',
        url: svgAssetUrl,
        rawSrc: Buffer.concat(this.incomingChunks).toString('utf-8')
      },
      ...externalScriptFileNamesToRun.map(scriptFileName => ({
        scriptFileName,
        url: assetGraph.resolveUrl(svgAssetUrl, scriptFileName)
      }))
    ];

    if (externalScriptFileNamesToRun.length > 0 && !this.options.url) {
      return reportError(
        new Error(
          'options.url is mandatory when runScript refers to external scripts (has a .js extension)'
        )
      );
    }

    assetGraph.on('error', reportError);
    assetGraph.on('warn', reportError);

    (async () => {
      try {
        await assetGraph.loadAssets(assetConfigsToLoad);
        await assetGraph.populate();

        const svgAsset = assetGraph.findAssets({ isInitial: true })[0];
        const document = svgAsset.parseTree;

        if (this.options.keepId) {
          const keepIds = arrayify(this.options.keepId);
          const removeDisplayNone = this.options.removeDisplayNone;
          (function traverse(node) {
            const type = node.nodeType;
            const id = node.getAttribute && node.getAttribute('id');
            if (id && keepIds.indexOf(id) !== -1) {
              if (
                removeDisplayNone &&
                node.hasAttribute('display') &&
                node.getAttribute('display') === 'none'
              ) {
                node.removeAttribute('display');
              }
              return true;
            } else if (node.childNodes) {
              let keep = type !== 1; // Non-element node
              for (let i = 0; i < node.childNodes.length; i += 1) {
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
          })(document);
        }

        if (this.options.runScript) {
          const runScriptIds = arrayify(this.options.runScript);
          const context = vm.createContext({
            assetGraph,
            console,
            svgFilter: this.options,
            document
          });
          context.window = context;

          for (const svgScript of assetGraph.findRelations({
            from: svgAsset,
            type: 'SvgScript'
          })) {
            if (
              this.options.runScript === true ||
              runScriptIds.indexOf(svgScript.node.getAttribute('id')) !== -1
            ) {
              runJavaScriptAsset(svgScript.to, context, reportError);
            }
          }

          for (const scriptFileName of externalScriptFileNamesToRun) {
            const javaScripts = assetGraph.findAssets({
              scriptFileName,
              isLoaded: true
            });
            if (javaScripts.length === 1) {
              const javaScript = javaScripts[0];
              this.emit('etagFragment', javaScript.md5Hex);
              runJavaScriptAsset(javaScript, context, reportError);
            } else {
              reportError(
                new Error(
                  `Unexpected number of JavaScript assets found for ${scriptFileName}: ${javaScripts.length}`
                )
              );
            }
          }
        }
        svgAsset.markDirty();
        this.outgoingChunks.push(svgAsset.rawSrc, null);
        this._proceed();
      } catch (err) {
        return reportError(err);
      }
    })();
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this._proceed();
  }
}

module.exports = SvgFilter;
