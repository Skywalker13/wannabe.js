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

    this._report = {};
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
      stdio: [null, null, null, 'ipc']
    });
    this._mocha.stderr.once ('data', () => next ());
    this._mocha.stdout.on ('data', (data) => {
      // TODO: send user outputs to the public API
    });

    this._mocha.on ('error', (err) => {
      console.error (err);
    });
    this._mocha.on ('message', (runner) => {
      this._report[runner.test.title] = {
        state:    runner.test.state,
        duration: runner.test.duration,
        timedOut: runner.test.timedOut,
        err:      runner.err
      };
      // TODO: send by event for async handling by atom-wannabe
    });
  }

  * _inspectGlobals (next) {
    /* Retrieves the scopes */
    const res = yield this._client.req ({
      command: 'scopes',
      arguments: {}
    }, next);

    const scopeRefs = res.scopes.map ((scope) => {
      return scope.object.ref;
    });

    const scopeDetails = yield this._client.reqLookup (scopeRefs, next);
    const globalRefs = [];

    /* Extract all globals from our scopes */
    const globals = Object.keys (scopeDetails)
      .filter ((key) => {
        return scopeDetails[key].properties.length > 0;
      })
      .map ((key) => {
        scopeDetails[key].properties.forEach ((prop) => {
          globalRefs.push (prop.ref);
        });
        return scopeDetails[key].properties;
      });

    const globalsLookup = yield this._client.reqLookup (globalRefs, next);

    /* Merge types and values */
    return globals.map ((props) => {
      return props.map ((prop) => {
        const item     = globalsLookup[prop.ref];
        prop.type      = item.type;

        if (item.className) {
          prop.className = item.className;
        }

        switch (item.className) {
          case 'Array': {
            prop.value = `Array(${item.properties.length - 1})`;
            break;
          }
          case 'Object': {
            prop.value = `Object({${item.properties.map ((prop) => prop.name)}})`;
            break;
          }
          default: {
            prop.value = item.value;
            break;
          }
        }

        return prop;
      })
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
    const globals  = yield this._inspectGlobals (next);
    const line = `${frames[0].line}`;

    if (!this._frames[line]) {
      this._frames[line] = [];
    }

    const frame = {
      locals: [],
      arguments: [],
      returnValue: null
    };

    globals.forEach ((p) => {
      p.filter ((glob) => !!glob.value).forEach ((glob) => {
        const local = {
          name:  glob.name,
          type:  glob.type,
          value: glob.value
        };

        if (glob.className) {
          loca.className = glob.className;
        }

        frame.locals.push (local);
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

    /* Search for the `message` property, use `text` otherwise */
    let textRef;
    const {exception} = ex.body;
    let text = exception.text;
    if (exception.properties &&
        exception.properties.some ((prop) => {
          if (prop.name === 'message') {
            textRef = prop.ref;
            return true;
          }
          return false;
        })) {
      ex.refs.some ((ref) => {
        if (ref.handle === textRef) {
          text = ref.text;
          return true;
        }
        return false;
      });
    }

    this._frames[line].push ({
      exception: {
        type: exception.type,
        text: text
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

  get report () {
    return this._report;
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
  const wannabe = new Wannabe (file);

  let tests = null;
  try {
    const extracted = extractor (file);
    const {lines, pattern} = extracted;
    if (!lines.length) {
      return {};
    }

    yield wannabe.init (pattern);

    yield wannabe.setBreakpoints (lines);
    frames = yield wannabe.run ();

    tests = extracted.tests.map ((test) => {
      if (wannabe.report[test.name]) {
        return Object.assign (test, wannabe.report[test.name]);
      }
      return test;
    });
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
