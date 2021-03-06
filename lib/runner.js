'use strict';

const watt = require ('watt');
const path = require ('path');
const {EventEmitter} = require ('events');
const {Client} = require ('_debugger');
const {spawn} = require ('child_process');
const escapeStringRegexp = require ('escape-string-regexp');

class Runner extends EventEmitter {
  /**
   * Construct the Wannabe object.
   *
   * @param {string} script - Test script.
   */
  constructor (script) {
    super ();

    this._report = {};
    this._frames = {};
    this._tests = [];
    this._extracted = {};
    this._script = script;
    this._client = new Client ();
    this._mocha = {
      kill: () => {},
    };

    watt.wrapAll (this);
  }

  get report () {
    return this._report;
  }

  get tests () {
    return this._tests;
  }

  get extracted () {
    return this._extracted;
  }

  set extracted (extracted) {
    this._extracted = extracted;
  }

  /**
   * Spawn mocha with the node debugger.
   *
   * @param {string|RegExp} pattern - Tests cases to grep.
   * @param {callback} next - Watt's callback.
   */
  _spawn (pattern, next) {
    const regex = pattern instanceof RegExp
      ? pattern.toString ().replace (/^\/(.*)\/.?$/, '$1')
      : escapeStringRegexp (pattern);

    this._mocha = spawn (
      'node',
      [
        '--debug',
        '--debug-brk',
        path.join (__dirname, './mocha.js'),
        this._script,
        regex,
      ],
      {
        detached: false,
        stdio: [null, null, null, 'ipc'],
      }
    );

    this._mocha.stderr.once ('data', () => next ());
    this._mocha.stdout.on ('data', () => {});

    this._mocha.on ('error', err => {
      console.error (err);
    });

    this._mocha.on ('message', runner => {
      if (runner.message === 'console') {
        if (!this._frames[runner.line]) {
          this._frames[runner.line] = [];
        }

        const frame = {
          line: parseInt (runner.line),
          payload: {
            console: {
              type: runner.type,
              text: runner.output,
            },
          },
          test: {
            line: this._extracted.lines[runner.line],
          },
        };
        this._frames[runner.line].push (frame);
        this.emit ('frame', frame);
        return;
      }

      const report = {
        state: runner.test.state,
        duration: runner.test.duration,
        timedOut: runner.test.timedOut,
        err: runner.err,
      };
      this._report[runner.test.title] = report;

      this._extracted.tests.some (test => {
        if (runner.test.title === test.name) {
          const _test = Object.assign (test, report);
          this._tests.push (_test);
          this.emit ('test', test);
          return true;
        }
        return false;
      });
    });
  }

  /**
   * Inspect the global variables.
   *
   * It retrieves the scopes, then extracts all globals. With each global
   * it extracts the value if possible, otherwise some informations for the
   * objects (the list of properties) and the arrays (the size).
   *
   * @param {callback} next - Watt's callback.
   * @return {Object} the properties.
   */
  *_inspectGlobals (next) {
    /* Retrieves the scopes */
    const res = yield this._client.req (
      {
        command: 'scopes',
        arguments: {},
      },
      next
    );

    const scopeRefs = res.scopes.map (scope => {
      return scope.object.ref;
    });

    const scopeDetails = yield this._client.reqLookup (scopeRefs, next);
    const globalRefs = [];

    /* Extract all globals from our scopes */
    const globals = Object.keys (scopeDetails)
      .filter (key => {
        return scopeDetails[key].properties.length > 0;
      })
      .map (key => {
        scopeDetails[key].properties.forEach (prop => {
          globalRefs.push (prop.ref);
        });
        return scopeDetails[key].properties;
      });

    const globalsLookup = yield this._client.reqLookup (globalRefs, next);

    /* Merge types and values */
    return globals.map (props => {
      return props.map (prop => {
        const item = globalsLookup[prop.ref];
        prop.type = item.type;

        if (item.className) {
          prop.className = item.className;
        }

        switch (item.className) {
          case 'Array': {
            prop.value = `Array(${item.properties.length - 1})`;
            break;
          }
          case 'Object': {
            prop.value = `Object({${item.properties.map (prop => prop.name)}})`;
            break;
          }
          default: {
            prop.value = item.value;
            break;
          }
        }

        return prop;
      });
    });
  }

  /**
   * Inspect the frame on the current breakpoint.
   *
   * It populates this._frames with the local variables.
   * The key of this._frames is the line number.
   *
   * NOTE: setBreakpoint is slow!
   *
   * @param {callback} next - Watt's callback.
   */
  *_inspectBreak (next) {
    const {frames} = yield this._client.reqBacktrace (next);
    const globals = yield this._inspectGlobals (next);
    const line = `${frames[0].line}`;

    if (!this._frames[line]) {
      this._frames[line] = [];
    }

    const frame = {
      line: parseInt (line),
      payload: {
        locals: [],
        arguments: [],
        returnValue: null,
      },
      test: {
        line: this._extracted.lines[line],
      },
    };

    globals.forEach (p => {
      p.filter (glob => !!glob.value).forEach (glob => {
        const local = {
          name: glob.name,
          type: glob.type,
          value: glob.value,
        };

        if (glob.className) {
          local.className = glob.className;
        }

        frame.payload.locals.push (local);
      });
    });

    frames[0].arguments.forEach (argument => {
      /* Arguments */
      frame.payload.arguments.push ({
        name: argument.name,
        type: argument.value.type,
        value: argument.value.value,
      });
    });

    /* Return value */
    if (frames[0].returnValue && frames[0].returnValue.type !== 'undefined') {
      frame.payload.returnValue = {
        type: frames[0].returnValue.type,
        value: frames[0].returnValue.value,
      };
    }

    this._frames[line].push (frame);
    this.emit ('frame', frame);
  }

  /**
   * Extract the first frame which is corresponding with our script.
   *
   * @param {callback} next - Watt's callback.
   * @return {Object} the frame or null.
   */
  *_extractFrame (next) {
    let found = null;
    const {frames} = yield this._client.fullTrace (next);

    const res = frames.some (frame => {
      found = frame;
      return frame.script.name === this._script;
    });

    return res ? found : null;
  }

  /**
   * Inspect the exception.
   *
   * It populates this._frames with an exception member.
   * The key of this._frames is the line number.
   *
   * @param {callback} ex - Debugger's exception.
   * @param {callback} next - Watt's callback.
   */
  *_inspectException (ex, next) {
    let line = 0;

    if (ex.body.script.name === this._script) {
      line = `${ex.body.sourceLine + 1}`;
    } else {
      const frame = yield this._extractFrame (next);
      if (!frame) {
        next ();
        return;
      }
      line = `${frame.line + 1}`;
    }

    if (!this._frames[line]) {
      this._frames[line] = [];
    }

    /* Search for the `message` property, use `text` otherwise */
    let textRef;
    const {exception} = ex.body;
    let text = exception.text;
    if (
      exception.properties &&
      exception.properties.some (prop => {
        if (prop.name === 'message') {
          textRef = prop.ref;
          return true;
        }
        return false;
      })
    ) {
      ex.refs.some (ref => {
        if (ref.handle === textRef) {
          text = ref.text;
          return true;
        }
        return false;
      });
    }

    const frame = {
      line: parseInt (line),
      payload: {
        exception: {
          type: exception.type,
          text: text,
        },
      },
      test: {
        line: this._extracted.lines[line],
      },
    };
    this._frames[line].push (frame);
    this.emit ('frame', frame);

    /* HACK: it stucks forever on parsing issues...
     * See https://github.com/nodejs/node/issues/1788
     */
    if (/^Unexpected token/.test (text) && exception.type === 'error') {
      this.dispose ();
    }

    next ();
  }

  /**
   * Initialize the client connection.
   *
   * It waits on the first breakpoint because the child is executed with
   * the --debug-brk argument.
   *
   * @param {string|RegExp} pattern - Tests cases to grep.
   * @param {callback} next - Watt's callback.
   */
  *init (pattern, next) {
    yield this._spawn (pattern, next);

    let first = true;
    this._client.on ('break', () => {
      if (first) {
        this.emit ('_ready');
        first = false;
        return;
      }

      this._inspectBreak (() => this._client.reqContinue (() => {}));
    });

    this._client.on ('exception', ex => {
      this._inspectException (ex, () => this._client.reqContinue (() => {}));
    });

    this._client.once ('connect', next.parallel ());
    this._client.connect (5858);
    yield next.sync ();

    yield this.once ('_ready', next); // wait for the first breakpoint (--debug-brk)
    yield this._client.reqSetExceptionBreak ('all', next);
  }

  /**
   * Set one or more breakpoints according to the current script.
   *
   * @param {number[]} lines - Lines where put the breakpoints.
   * @param {callback} next - Watt's callback.
   */
  *setBreakpoints (lines, next) {
    for (const line of lines) {
      this._client.setBreakpoint (
        {
          type: 'script',
          target: this._script,
          line: parseInt (line),
        },
        next.parallel ()
      );
    }

    yield next.sync ();
  }

  /**
   * Run Wannabe.
   *
   * When a new breakpoint is reached, the continue request is automatically
   * sent until that the child is terminated.
   *
   * @param {callback} next - Watt's callback.
   * @return {Object[]} all frames.
   */
  *run (next) {
    const promise = new Promise (resolve => {
      this._client.once ('error', () => {
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

module.exports = Runner;
