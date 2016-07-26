'use strict';

const fs       = require ('fs');
const path     = require ('path');
const babylon  = require ('babylon');
const traverse = require ('traverse');


class LinesExtractor {
  static _extractor (data, funcName, pattern) {
    const ast = babylon.parse (data, {
      sourceType: "module",
      plugins: [
        "jsx"
      ]
    });

    const isRegex = pattern instanceof RegExp;
    const pathTmp = []; /* List of interresting function body */
    const traversed = traverse (ast.program.body);

    return Object.keys (traversed
      .reduce (function (acc, node) {
        if (!node) {
          return acc;
        }

        if (node.type === 'CallExpression' &&
            funcName === node.callee.name &&
            (isRegex ? pattern.test (node.arguments[0].value) : node.arguments[0].value === pattern)) {
          /* Extract only nodes in the function body of the second argument
           * it ('my test', function () { ...body... });
           */
          const bodyPath = this.path.concat ([
            'arguments', '1', 'body', 'body'
          ]);
          /* Add the body as path in a temporary list */
          pathTmp.push (bodyPath.join ('.'));
        } else if (node.loc &&
                   !/Comment(Line|Block)/.test (node.type)) {
          const newPath = this.path.join ('.');
          /* Push only the path that are children of at least one body */
          if (pathTmp.some ((p) => newPath.startsWith (p))) {
            acc.push (this.path);
          }
        }
        return acc;
      }, [])
      .reduce (function (acc, p) {
        const node = traversed.get (p);
        acc[node.loc.start.line] = null;
        return acc;
      }, {}))
      .map ((line) => parseInt (line));
  }

  static byFile (location, funcName, pattern) {
    try {
      fs.accessSync (location, fs.constants.R_OK);
      return LinesExtractor._extractor (fs.readFileSync (location).toString (), funcName, pattern);
    } catch (ex) {
      throw ex;
    }
  }

  static byData (script, funcName, pattern) {
    return LinesExtractor._extractor (script, funcName, pattern);
  }
}

module.exports = LinesExtractor;
