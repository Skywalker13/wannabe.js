'use babel';
'use strict';

const {EventEmitter}     = require ('events');
const {Client}           = require ('_debugger');
const {spawn}            = require ('child_process');
const watt               = require ('watt');
const escapeStringRegexp = require ('escape-string-regexp');
const path               = require ('path');
const fs                 = require ('fs');
const tmp                = require ('tmp');

const Extractor = require ('./extractor.js');


class Wannabe extends EventEmitter {
  /**
   * Construct the Wannabe object.
   *
   * @param {string} script - Test script.
   */
  constructor (script) {
    super ();

    this._frames = {};
    this._script = script;
    this._client = new Client ();
    this._mocha  = {
      kill: () => {}
    };

    watt.wrapAll (this);
  }

  /**
   * Spawn mocha with the node debugger.
   *
   * @param {string|RegExp} regtest - Tests cases to grep.
   */
  _spawn (pattern, next) {
    const regex = pattern instanceof RegExp ?
                  pattern.toString ().replace (/^\/(.*)\/.?$/, '$1') :
                  escapeStringRegexp (pattern);

    this._mocha = spawn ('node', [
      '--debug',
      '--debug-brk',
      path.join (__dirname, './mocha.js'),
      this._script,
      regex
    ], {
      detached: false,
      stdio: ['ignore', 'ignore', 'pipe']
    });

    this._mocha.unref ();

    this._mocha.stderr.once ('data', () => next ());

    this._mocha.on ('close', () => {});
    this._mocha.on ('error', (err) => {
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
  * _inspectBreak (next) {
    const {frames} = yield this._client.reqBacktrace (next);
    const line = `${frames[0].line}`;

    if (!this._frames[line]) {
      this._frames[line] = [];
    }

    const frame = {
      locals: [],
      arguments: [],
      returnValue: null
    };

    frames[0].locals.forEach ((local) => {
      /* Local variables */
      frame.locals.push ({
        name:  local.name,
        type:  local.value.type,
        value: local.value.value || local.value.className
      });
    });

    frames[0].arguments.forEach ((argument) => {
      /* Arguments */
      frame.arguments.push ({
        name:  argument.name,
        type:  argument.value.type,
        value: argument.value.value
      });
    });

    /* Return value */
    if (frames[0].returnValue && frames[0].returnValue.type !== 'undefined') {
      frame.returnValue = {
        type: frames[0].returnValue.type,
        value: frames[0].returnValue.value
      };
    }

    this._frames[line].push (frame);
  }

  /**
   * Extract the first frame which is corresponding with our script.
   *
   * @returns the frame or null.
   */
  * _extractFrame (next) {
    let found = null;
    const {frames} = yield this._client.fullTrace (next);

    frames.some ((frame) => {
      found = frame;
      return frame.script.name == this._script;
    });

    return found;
  }

  /**
   * Inspect the exception.
   *
   * It populates this._frames with an exception member.
   * The key of this._frames is the line number.
   */
  * _inspectException (ex, next) {
    let line = 0;

    if (ex.body.script.name === this._script) {
      line = `${ex.body.sourceLine + 1}`;
    } else {
      const frame = yield this._extractFrame (next);
      if (frame) {
        line = `${frame.line + 1}`;
      }
    }

    if (!this._frames[line]) {
      this._frames[line] = [];
    }

    this._frames[line].push ({
      exception: {
        type: ex.body.exception.type,
        text: ex.body.exception.text
      }
    });

    next ();
  }

  /**
   * Initialize the client connection.
   *
   * It waits on the first breakpoint because the child is executed with
   * the --debug-brk argument.
   *
   * @param {string|RegExp} regtest - Tests cases to grep.
   */
  * init (pattern, next) {
    yield this._spawn (pattern, next);

    let first = true;
    this._client.on ('break', () => {
      if (first) {
        this.emit ('ready');
        first = false;
        return;
      }

      this._inspectBreak (() => this._client.reqContinue (() => {}));
    });

    this._client.on ('exception', (ex) => {
      this._inspectException (ex, () => this._client.reqContinue (() => {}));
    });

    this._client.once ('connect', next.parallel ());
    this._client.connect (5858);
    yield next.sync ();

    yield this.once ('ready', next); // wait for the first breakpoint (--debug-brk)
    yield this._client.reqSetExceptionBreak ('all', next);
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

  dispose () {
    this._mocha.kill ('SIGKILL');
  }
}

const extract = watt (function * (script, data, extractor, next) {
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
  const wannabe = new Wannabe (file);

  try {
    const {lines, pattern} = extractor (file);
    if (!lines.length) {
      return {};
    }

    yield wannabe.init (pattern);

    yield wannabe.setBreakpoints (lines);
    frames = yield wannabe.run ();
  } catch (ex) {
    _exThrown = true;
    throw ex;
  } finally {
    wannabe.dispose ();
    if (data) {
      yield fs.unlink (file, next);
    }
    // FIXME: see watt bug: https://github.com/mappum/watt/issues/16
    if (!_exThrown) {
      return frames;
    }
  }
});

exports.byPattern = watt (function * (script, data, funcName, pattern, next) {
  return yield extract (script, data, (file) => {
    const lines = data ?
      Extractor.byFuncInData (data, funcName, pattern) :
      Extractor.byFuncInFile (file, funcName, pattern);
    return {
      lines,
      pattern
    }
  }, next);
});

exports.byLine = watt (function * (script, data, funcName, line, next) {
  return yield extract (script, data, (file) => {
    return data ?
      Extractor.byLineInData (data, funcName, line) :
      Extractor.byLineInFile (file, funcName, line);
  }, next);
});
