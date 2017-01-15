
# Wannabe.js

Main backend for [atom-wannabe][2] module.

**WORK IN PROGRESS**

It extracts the useful lines of a javascript test file which can be run by
the mocha test runner. Breakpoints are set on these lines; then the node
debugger is used in order to retrieve the frame for each line. Local variables
are extracted from these frames.

## Internal steps

1. Use `Extractor` in order to extract all lines of a specific test.
2. Run **mocha** on the specified test and break on the first line.
3. Enable breakpoints for all exceptions.
4. Set breakpoints for all lines retrieved with the `Extractor`.
5. Continue to the next breakpoint (or exception break) and save the context
   in a map until that mocha is terminated.

The runner is async, the frames are sent to the client by the event emitter.

## API

```js
Wannabe (script, data, funcNames, extractFrom);
Wannabe.run ();
Wannabe.runner ();
Wannabe.dispose ();
```

 * `script`: script to run with **mocha** (depends of `data`)
 * `data`: the content of the script (can be `null`)
 * `funcName`: name of the functions to inspect (for example, `it ()`)
 * `extractFrom`: a line number or a regex pattern for a **mocha** test name

If a content is passed with `data`, then only the parent directory of `script`
is used. Because **mocha** is not able to run a test provided by a buffer,
it's necessary to write a file. Then the parent directory is the destination
of the temporary file. The new file is prefixed by `.wannabe-`. It's removed
as soon as the runner is disposed.

It can a bit annoying because the file is seen ba the atom treeview.

The methods `run ()` and `runner ()` return a promise ([watt][1]) or it can be
used with a callback.

```js
wannabe.run ().then ((res) => {}, (err) => {});
wannabe.run ((err, res) => {});
```

Note that the [watt][1] promises can not be chainable, it's a known limitation.
See https://github.com/mappum/watt/issues/15

### Example

File (test for **mocha**): `./test.js`

```js
'use strict';

describe ('foobar', function () {
  it ('test1', function () {
    /* ... */
  });

  it ('test2', function () {
    /* ... */
  });
});

```

Wannabe:

```js
'use strict';

const watt    = require ('watt');
const Wannabe = require ('wannabe');

const runTests = watt (function * (script, data, funcName, extractFrom) {
  const wannabe = new Wannabe ('./test.js', null, 'it', /test[0-9]/);
  const runner = yield wannabe.runner ();

  runner.on ('frame', console.log);
  runner.on ('test', console.log);

  const res = yield wannabe.run ();
  wannabe.dispose (); /* optional; use dispose to stop a running wannabe */
  return res;
});

runTests ('./test.js', null, 'it', /test[0-9]/)
  .then ((res) => {
    const {frames, tests} = res;
    // Retrieves all frames and all tests results
  }, console.error);

runTests ('./test.js', null, 'it', 5)
  .then ((res) => {
    const {frames, tests} = res;
    // Retrieves all frames and all tests results
  }, console.error);
```

The `frames` argument is an object where the keys are the lines and the value
is an array of locals.

## Drawbacks

- It's not very fast because it relies on the node debugger (which adds a major
  overhead). But for standard test files it works fine.
- Babel is not really supported. A commented code exists in the `mocha.js`
  script file of this project in order to enable the support. It's just a
  test and it doesn't work very well. The major limitation is that babel is
  very slow in this case. If you want to write code where babel is mandatory,
  don't use **wannabe**.


[1]: https://github.com/mappum/watt
[2]: https://github.com/Skywalker13/atom-wannabe
