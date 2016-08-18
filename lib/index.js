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
          throw new Error ('unsupported script');
        }
      } catch (ex) {}
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

  * run (next) {
    yield this._init ();

    let _exThrown = false;
    let frames    = null;
    this._runner  = new Runner (this._file);

    try {
      this._runner.extracted = this._extractor (this._file);
      const {lines, pattern} = this._runner.extracted;
      if (!lines.length) {
        return {};
      }

      yield this._runner.init (pattern);

      yield this._runner.setBreakpoints (lines);
      frames = yield this._runner.run ();
    } catch (ex) {
      _exThrown = true;
      throw ex;
    } finally {
      this._runner.dispose ();
      if (this._data) {
        yield fs.unlink (this._file, next);
      }

      // FIXME: see watt bug: https://github.com/mappum/watt/issues/16
      if (!_exThrown) {
        return {
          frames,
          tests: this._runner.tests
        };
      }
    }
  }
}

module.exports = Wannabe;
