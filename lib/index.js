'use babel';
'use strict';

const watt = require ('watt');
const path = require ('path');
const fs   = require ('fs');
const tmp  = require ('tmp');

const Extractor = require ('./extractor.js');
const Runner    = require ('./runner.js');


class Wannabe {
  constructor (script, data, funcName, extractFrom) {
    this._runner = null;
    this._file   = null;
    this._script = script;
    this._data   = data;

    watt.wrapAll (this);

    /* Skip one wannabe.js spec file (prevent recursive bug) with atom-wannabe. */
    if (/.*index\.spec\.js$/.test (script)) {
      try {
        const data = fs.readFileSync (path.join (script, '../../package.json'));
        const def = JSON.parse (data);
        if (def.name === 'wannabe') {
          throw new Error ('wannabe');
        }
      } catch (ex) {
        if (ex.message === 'wannabe') {
          throw new Error ('Prevent infinite loop with wannabe test file');
        }
      }
    }

    this._extractor = (file) => {
      let ext;
      const src = this._data || file;
      if (Number.isInteger (extractFrom)) {
        ext = this._data ? 'byLineInData' : 'byLineInFile';
      } else {
        ext = this._data ? 'byFuncInData' : 'byFuncInFile';
      }

      const extractor = new Extractor ();
      return extractor[ext] (src, funcName, extractFrom);
    };
  }

  * _init (next) {
    if (!this._data) {
      this._file = this._script;
      return;
    }

    /* We must create a new script in the same location that {script}.
     * The reason is that we can not pass a buffer to mocha; only files
     * can be passed to the runner.
     */
    this._file = yield tmp.tmpName ({
      template: path.join (this._script, '../.wannabe-XXXXXX')
    }, next);
    yield fs.writeFile (this._file, this._data, next);
  }

  * runner () {
    if (this._runner) {
      return this._runner;
    }

    yield this._init ();
    this._runner = new Runner (this._file);
    return this._runner;
  }

  * run (next) {
    let _exThrown = false;
    let frames    = null;
    const runner  = yield this.runner ();

    try {
      runner.extracted = this._extractor (this._file);
      const {pattern} = runner.extracted;
      const lines = Object.keys (runner.extracted.lines);
      if (!lines.length) {
        return {};
      }

      yield runner.init (pattern);

      yield runner.setBreakpoints (lines);
      frames = yield runner.run ();
    } catch (ex) {
      _exThrown = true;
      throw ex;
    } finally {
      runner.dispose ();
      if (this._data) {
        yield fs.unlink (this._file, next);
      }

      // FIXME: see watt bug: https://github.com/mappum/watt/issues/16
      if (!_exThrown) {
        return {
          frames,
          tests: runner.tests
        };
      }
    }
  }
}

module.exports = Wannabe;
