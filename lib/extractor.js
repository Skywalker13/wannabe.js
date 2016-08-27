'use strict';

const fs       = require ('fs');
const babylon  = require ('babylon');
const traverse = require ('traverse');


class Extractor {
  constructor () {
    this._tests = [];
  }

  static _traverseAST (data) {
    return traverse (babylon.parse (data, {
      sourceType: 'module',
      plugins: [
        'jsx'
      ]
    }));
  }

  _getTestBody (data, funcNames, line) {
    const self = this;
    const traversed  = Extractor._traverseAST (data);
    let testName     = null;
    let testBodyPath = null;
    let testLine     = null;

    traversed
      .reduce (function (prevNode, node) {
        if (testName || !node || !node.type) { // Consider Token node too
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

        this.path.some ((_, i) => {
          const newPath = this.path.slice (0, i);
          const n = traversed.get (newPath);
          if (!n || !n.callee || !funcNames.test (n.callee.name)) {
            return false;
          }

          testName = n.arguments[0].value;
          testBodyPath = newPath.concat ([
            'arguments', '1', 'body', 'body'
          ]);
          testLine = n.loc.start.line;

          self._tests.push ({
            name: testName,
            line: n.loc.start.line
          });

          this.stop ();
          return true;
        });
      }, {});

    return {
      name: testName,
      node: testBodyPath && traversed.get (testBodyPath),
      line: testLine
    };
  }

  _getLinesFromNode (nodeRoot, testTine) {
    const traversed = traverse (nodeRoot);

    return traversed
      .reduce (function (acc, node) {
        if (!node) {
          return acc;
        }

        if (node.loc && !/Comment(Line|Block)/.test (node.type)) {
          acc.push (this.path);
        }
        return acc;
      }, [])
      .reduce (function (acc, p) {
        const node = traversed.get (p);
        acc[node.loc.start.line] = testTine;
        return acc;
      }, {});
  }

  _getLinesFromData (data, funcNames, pattern) {
    const self = this;
    const traversed = Extractor._traverseAST (data);
    const isRegex = pattern instanceof RegExp;
    const pathTmp = []; /* List of interresting function body */

    return traversed
      .reduce (function (acc, node) {
        if (!node || node.constructor.name !== 'Node') { // Skip Token here
          return acc;
        }

        if (node.type === 'CallExpression' &&
            funcNames.test (node.callee.name) &&
            (isRegex ? pattern.test (node.arguments[0].value) : node.arguments[0].value === pattern)) {
          /* Extract only nodes in the function body of the second argument
           * it ('my test', function () { ...body... });
           */
          const bodyPath = this.path.concat ([
            'arguments', '1', 'body', 'body'
          ]);
          /* Add the body as path in a temporary list */
          pathTmp.push ({
            line: node.loc.start.line,
            path: bodyPath.join ('.')
          });

          self._tests.push ({
            name: node.arguments[0].value,
            line: node.loc.start.line
          });
        } else if (node.loc &&
                   !/Comment(Line|Block)/.test (node.type)) {
          let line = null;
          const newPath = this.path.join ('.');
          /* Push only the path that are children of at least one body */
          if (pathTmp.some ((p) => {
            line = p.line;
            return newPath.startsWith (p.path);
          })) {
            acc.push ({
              line,
              path: this.path
            });
          }
        }
        return acc;
      }, [])
      .reduce (function (acc, p) {
        const node = traversed.get (p.path);
        acc[node.loc.start.line] = p.line;
        return acc;
      }, {});
  }

  byFuncInFile (location, funcNames, pattern) {
    const R_OK = fs.constants && fs.constants.R_OK || fs.R_OK;
    fs.accessSync (location, R_OK);
    const lines = this._getLinesFromData (fs.readFileSync (location).toString (), funcNames, pattern);
    return {
      lines,
      pattern,
      tests: this._tests
    };
  }

  byFuncInData (script, funcNames, pattern) {
    const lines = this._getLinesFromData (script, funcNames, pattern);
    return {
      lines,
      pattern,
      tests: this._tests
    };
  }

  byLineInFile (location, funcNames, line) {
    try {
      const R_OK = fs.constants && fs.constants.R_OK || fs.R_OK;
      fs.accessSync (location, R_OK);
      return this.byLineInData (fs.readFileSync (location).toString (), funcNames, line);
    } catch (ex) {
      throw ex;
    }
  }

  byLineInData (script, funcNames, line) {
    const testBody = this._getTestBody (script, funcNames, line);
    if (!testBody.name || !testBody.node) {
      return {
        lines: {},
        pattern: null,
        tests: this._tests
      };
    }

    return {
      lines: this._getLinesFromNode (testBody.node, testBody.line),
      pattern: testBody.name,
      tests: this._tests
    };
  }
}

module.exports = Extractor;
