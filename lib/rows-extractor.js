'use strict';

const fs       = require ('fs');
const path     = require ('path');
const babylon  = require ('babylon');
const traverse = require ('traverse');


class RowsExtractor {
  static _extractor (data, pattern) {
    const ast = babylon.parse (data, {
      sourceType: "module",
      plugins: [
        "jsx"
      ]
    });

    const isRegex = pattern instanceof RegExp;

    return Object.keys (traverse (ast.program.body)
      .reduce ((acc, node) => {
        if (node && node.type === 'CallExpression' &&
            (isRegex ? pattern.test (node.callee.name) : pattern === node.callee.name)) {
          // Extract only nodes in the function body of the second argument
          // it ('my test', function () { ...body... });
          acc = acc.concat (node.arguments[1].body.body);
        }
        return acc;
      }, [])
      .reduce ((acc, node) => {
        acc[node.loc.start.line] = null;
        return acc;
      }, {}));
  }

  static byFile (location, pattern) {
    try {
      fs.accessSync (location, fs.constants.R_OK);
      return RowsExtractor._extractor (fs.readFileSync (location).toString (), pattern);
    } catch (ex) {
      throw ex;
    }
  }

  static byData (script, pattern) {
    return RowsExtractor._extractor (script, pattern);
  }
}

module.exports = RowsExtractor;
