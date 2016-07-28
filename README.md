
# Wannabe.js

Backend for *atom-wannabe* module.

**WORK IN PROGRESS**

It extracts the useful lines of a javascript test file which can be run by
the mocha test runner. Breakpoints are set on these lines; then the node debugger
is used in order to retrieve the frame for each line. Local variables are
extracted from these frames.

## Steps

1. Use `linesExtractor` in order to extract all lines of a specific test.
2. Run **mocha** on the specified test and break on the first line.
3. Set breakpoints for all lines retrieved with `linesExtractor`.
4. Continue to the next breakpoint and save the context in a map.
5. Loop (point 4) until that mocha is terminated.

## API

```js
wannabe (script, data, funcName, pattern, callback);
```

 * `script`: script to run with **mocha** (depends of `data`)
 * `data`: the content of the script (can be null)
 * `funcName`: name of the functions to inspect (for example, `it()`)
 * `pattern`: extract only function which match `it (pattern, ...)`
 * `callback`: the extracted frames

If a content is passed with `data`, then only the parent directory of `script`
is used. Because **mocha** is not able to run a test provided by a buffer,
it's necessary to write a file. Then the parent directory is the destination
of the temporary file. The new file is prefixed by `.wannabe-`. It's removed
as soon as the run is terminated.

### Example

File (test for mocha): `./test.js`

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

const wannabe = require ('wannabe');

wannabe ('./test.js', null, 'it', /test[0-9]/, (err, frames) => {
  /* ... */
});
```

The `frames` argument is an object where the keys are the lines and the value
is an array of locals.
