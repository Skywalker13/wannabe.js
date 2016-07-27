'use strict';

const {Client}           = require ('_debugger');
const {spawn}            = require ('child_process');
const watt               = require ('watt');
const escapeStringRegexp = require ('escape-string-regexp');
const path               = require ('path');

const linesExtractor = require ('./lines-extractor.js');


class Wannabe {
  /**
   * Construct the Wannabe object.
   *
   * @param {string} script - Test script.
   * @param {string|RegExp} regtest - Tests cases to grep.
   */
  constructor (script, regtest) {
    this._frames  = {};
    this._script  = script;
    this._client  = new Client ();
    this._regtest = regtest;

    watt.wrapAll (this);
  }

  /**
   * Spawn mocha with the node debugger.
   */
  _spawn (next) {
    const regex = this._regtest instanceof RegExp ?
                  this._regtest.toString ().replace (/^\/(.*)\/.?$/, '$1') :
                  escapeStringRegexp (this._regtest);

    const mocha = spawn ('node', [
      '--debug',
      '--debug-brk',
      path.join (__dirname, './mocha.js'),
      this._script,
      regex
    ], {
      detached: false,
      stdio: ['ignore', 'ignore', 'pipe']
    });

    mocha.unref ();

    mocha.stderr.on ('data', (data) => {
      if (/Debugger listening/.test (data.toString ())) {
        // HACK: it's not really listening when it's printed;
        //       then wait for 100ms :-(
        setTimeout (next, 100);
      }
    });

    mocha.on ('close', () => {});
    mocha.on ('error', (err) => {
      console.error (err);
    });
  }

  /**
   * Inspect the frame on the current breakpoint.
   *
   * It populates this._frames with the local variables.
   * The key of this._frames is the line number.
   *
   * NOTE: setBreakpoint is slow!
   */
  * _inspect (next) {
    const {frames} = yield this._client.reqBacktrace (next);

    this._frames[`${frames[0].line}`] = [];
    frames[0].locals.forEach ((local) => {
      this._frames[`${frames[0].line}`].push ({
        name:  local.name,
        value: local.value.value
      });
    });
  }

  * init (next) {
    yield this._spawn (next);

    let skip = true;
    this._client.on ('break', () => {
      if (skip) {
        skip = false;
        return;
      }
      this._inspect (() => {
        this._client.reqContinue (() => {});
      });
    });

    this._client.on ('error', (err) => {
      // console.error (err);
    });

    this._client.connect (5858);
  }

  /**
   * Set one or more breakpoints according to the current script.
   *
   * @param {number[]} lines - Lines where put the breakpoints.
   */
  * setBreakpoints (lines, next) {
    for (const line of lines) {
      this._client.setBreakpoint ({
        type:   'script',
        target: this._script,
        line:   line
      }, next.parallel ());
    }

    yield next.sync ();
  }

  /**
   * Run Wannabe.
   *
   * @returns all frames.
   */
  * run (next) {
    const promise = new Promise ((resolve) => {
      this._client.on ('error', (err) => {
        resolve (this._frames);
      });

      this._client.on ('close', () => {
        resolve (this._frames);
      });
    });

    yield this._client.reqContinue (next);
    return yield promise;
  }
}

watt (function * (next) {
  const script = path.join (__dirname, '../test/sample.js');
  const lines = linesExtractor.byFile (script, 'it', 'a.1');

  const wannabe = new Wannabe (script, 'a.1');
  yield wannabe.init ();
  yield wannabe.setBreakpoints (lines);
  const frames = yield wannabe.run ();

  Object.keys (frames).forEach ((line) => {
    const frame = frames[line];
    console.log (`line:${line}`);
    frame.forEach ((local) => {
      console.log (` -> ${local.name}:${local.value}`);
    });
  });
  console.log ();
}) ();
