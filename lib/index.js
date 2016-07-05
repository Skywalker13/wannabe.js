'use strict';

const watt = require ('watt');


class Wannabe {
  constructor () {
    this._client = require ('v8-debugger').createClient ({port: 5858});

    watt.wrapAll (this);
  }

  * inspect (next) {
    // const variables = yield this._client.reqScopes (next);
    // console.dir (variables);

    const {frames} = yield this._client.reqBacktrace (next);
    console.dir (frames[0]);
    console.dir (frames[0].locals);

    // for (const variable of variables) {
    //  const value = yield this._client.reqFrameEval (variable, bts.frames[0], next);
    // }
  }
}

const wannabe = new Wannabe;
wannabe.inspect ();
