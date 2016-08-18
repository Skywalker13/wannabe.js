'use babel';
'use strict';

const watt = require ('watt');
const path = require ('path');
const fs   = require ('fs');
const tmp  = require ('tmp');

const Extractor = require ('./extractor.js');
const Runner    = require ('./runner.js');



const extract = watt (function * (script, data, extractor, next) {
  /* Skip one wannabe.js spec file (prevent recursive bug) with atom-wannabe. */
  if (/.*index\.spec\.js$/.test (script)) {
    try {
      const data = fs.readFileSync (path.join (script, '../../package.json'));
      const def = JSON.parse (data);
      if (def.name === 'wannabe') {
        return {};
      }
    } catch (ex) {}
  }

  let file = null;
  if (data) {
    /* We must create a new script in the same location that {script}.
     * The reason is that we can not pass a buffer to mocha; only files
     * can be passed to the runner.
     */
    file = yield tmp.tmpName ({
      template: path.join (script, '../.wannabe-XXXXXX')
    }, next);
    yield fs.writeFile (file, data, next);
  } else {
    file = script;
  }

  let _exThrown = false;
  let frames = null;
  const runner = new Runner (file);

  let tests = null;
  try {
    const extracted = extractor (file);
    const {lines, pattern} = extracted;
    if (!lines.length) {
      return {};
    }

    yield runner.init (pattern);

    yield runner.setBreakpoints (lines);
    frames = yield runner.run ();

    tests = extracted.tests.map ((test) => {
      if (runner.report[test.name]) {
        return Object.assign (test, runner.report[test.name]);
      }
      return test;
    });
  } catch (ex) {
    _exThrown = true;
    throw ex;
  } finally {
    runner.dispose ();
    if (data) {
      yield fs.unlink (file, next);
    }
    // FIXME: see watt bug: https://github.com/mappum/watt/issues/16
    if (!_exThrown) {
      return {
        frames,
        tests
      };
    }
  }
});

exports.byPattern = watt (function * (script, data, funcName, pattern, next) {
  return yield extract (script, data, (file) => {
    const extractor = new Extractor ();
    return data ?
      extractor.byFuncInData (data, funcName, pattern) :
      extractor.byFuncInFile (file, funcName, pattern);
  }, next);
});

exports.byLine = watt (function * (script, data, funcName, line, next) {
  return yield extract (script, data, (file) => {
    const extractor = new Extractor ();
    return data ?
      extractor.byLineInData (data, funcName, line) :
      extractor.byLineInFile (file, funcName, line);
  }, next);
});
