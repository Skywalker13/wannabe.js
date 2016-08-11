'use strict';

const fs       = require ('fs');
const path     = require ('path');
const babylon  = require ('babylon');
const traverse = require ('traverse');


class LinesExtractor {
  static _traverseAST (data) {
    return traverse (babylon.parse (data, {
      sourceType: "module",
      plugins: [
        "jsx"
      ]
    }));
  }

  static _getTestBody (data, line, funcName) {
    const traversed  = LinesExtractor._traverseAST (data);
    let testName     = null;
    let testBodyPath = null;

    traversed
      .reduce (function (prevNode, node) {
        if (testName || !node || !node.type) {
          return prevNode;
        }

        if (node.loc.start.line > line) {
          node = prevNode;
        } else if (node.loc.start.line !== line) {
          return node || prevNode;
        }

        if (!node) {
          return;
        }

        for (let i = 0; i < this.path.length; ++i) {
          const newPath = this.path.slice (0, i);
          const n = traversed.get (newPath);
          if (n && n.callee && n.callee.name === 'it') {
            testName = n.arguments[0].value;
            testBodyPath = newPath.concat ([
              'arguments', '1', 'body', 'body'
            ]);
            this.stop ();
            return null;
          }
        }
      }, {});

    return {
      name: testName,
      node: testBodyPath && traversed.get (testBodyPath)
    };
  }

  static _getLinesFromNode (nodeRoot) {
    const traversed = traverse (nodeRoot);
    const pathTmp   = []; /* List of interresting function body */

    return Object.keys (traversed
      .reduce (function (acc, node) {
        if (!node) {
          return acc;
        }

        if (node.loc && !/Comment(Line|Block)/.test (node.type)) {
          const newPath = this.path.join ('.');
          acc.push (this.path);
        }
        return acc;
      }, [])
      .reduce (function (acc, p) {
        const node = traversed.get (p);
        acc[node.loc.start.line] = null;
        return acc;
      }, {})
    ).map ((line) => parseInt (line));
  }

  static _getLinesFromData (data, funcName, pattern) {
    const traversed = LinesExtractor._traverseAST (data);
    const isRegex = pattern instanceof RegExp;
    const pathTmp = []; /* List of interresting function body */

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
      }, {})
    ).map ((line) => parseInt (line));
  }

  static byFile (location, funcName, pattern) {
    try {
      const R_OK = fs.constants && fs.constants.R_OK || fs.R_OK;
      fs.accessSync (location, R_OK);
      return LinesExtractor._getLinesFromData (fs.readFileSync (location).toString (), funcName, pattern);
    } catch (ex) {
      throw ex;
    }
  }

  static byData (script, funcName, pattern) {
    return LinesExtractor._getLinesFromData (script, funcName, pattern);
  }

  static byLine (script, line, funcName) {
    const testBody = LinesExtractor._getTestBody (script, line, funcName);
    if (!testBody.name || !testBody.node) {
      return [];
    }

    return LinesExtractor._getLinesFromNode (testBody.node);
  }
}

module.exports = LinesExtractor;
