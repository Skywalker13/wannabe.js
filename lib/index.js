'use strict';

const {EventEmitter}     = require ('events');
const {Client}           = require ('_debugger');
const {spawn}            = require ('child_process');
const watt               = require ('watt');
const escapeStringRegexp = require ('escape-string-regexp');
const path               = require ('path');
const fs                 = require ('fs');

const linesExtractor = require ('./lines-extractor.js');


class Wannabe extends EventEmitter {
  /**
   * Construct the Wannabe object.
   *
   * @param {string} script - Test script.
   * @param {string|RegExp} regtest - Tests cases to grep.
   */
  constructor (script, regtest) {
    super ();

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

    mocha.stderr.once ('data', () => next ());

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

  /**
   * Initialize the client connection.
   *
   * It waits on the first breakpoint because the child is executed with
   * the --debug-brk argument.
   */
  * init (next) {
    yield this._spawn (next);

    let first = true;
    this._client.on ('break', () => {
      if (first) {
        this.emit ('ready');
        first = false;
        return;
      }

      this._inspect (() => this._client.reqContinue (() => {}));
    });

    this._client.once ('connect', next.parallel ());
    this._client.connect (5858);
    yield next.sync ();

    yield this.once ('ready', next); // wait for the first breakpoint (--debug-brk)
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
   * When a new breakpoint is reached, the continue request is automatically
   * sent until that the child is terminated.
   *
   * @returns all frames.
   */
  * run (next) {
    const promise = new Promise ((resolve) => {
      this._client.once ('error', (err) => {
        resolve (this._frames);
      });

      this._client.once ('close', () => {
        resolve (this._frames);
      });
    });

    yield this._client.reqContinue (next);
    return yield promise;
  }
}

module.exports = watt (function * (script, data, func, pattern, next) {
  if (data) {
    /* We must create a new script in the same location that {script}.
     * The reason is that we can not pass a buffer to mocha; only files
     * can be passed to the runner.
     */
    file = path.join (script, `../.wannabe-${path.basename (script)}`);
    yield fs.writeFile (file, data, next);
  } else {
    file = script;
  }

  let frames = null;
  try {
    const wannabe = new Wannabe (file, pattern);
    yield wannabe.init ();

    const lines = data ?
      linesExtractor.byData (data, func, pattern) :
      linesExtractor.byFile (file, func, pattern);

    yield wannabe.setBreakpoints (lines);
    frames = yield wannabe.run ();
  } catch (ex) {
    throw ex;
  } finally {
    if (data) {
      yield fs.unlink (file, next);
    }
    return frames;
  }
});
