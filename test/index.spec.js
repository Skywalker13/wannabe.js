'use strict';

const path     = require ('path');
const {expect} = require ('chai');
const wannabe  = require ('../lib/index.js');


const goodResult = {
  '12': [{
    name: 'test',
    value: 'foo'
  }, {
    name: 'a1',
    value: undefined
  }],
  '13': [{
    name: 'test',
    value: 'foo'
  }, {
    name: 'a1',
    value: 'foo - bar'
  }]
};

describe ('index', function () {
  it ('#byPattern (good js)', function (done) {
    wannabe.byPattern (path.join (__dirname, './sample.js'), null, 'it', 'a.1', (err, frames) => {
      expect (err).to.be.null;
      expect (frames).to.be.eql (goodResult);
      done ();
    });
  });

  it ('#byPattern (bad js)', function (done) {
    wannabe.byPattern (path.join (__dirname, './other.txt'), null, 'it', 'a.1', (err, frames) => {
      expect (err.message).to.match (/Unexpected token.*/);
      done ();
    });
  });

  it ('#byLine (good js)', function (done) {
    wannabe.byLine (path.join (__dirname, './sample.js'), null, 'it', 13, (err, frames) => {
      expect (err).to.be.null;
      expect (frames).to.be.eql (goodResult);
      done ();
    });
  })

  it ('#byLine (bad js)', function (done) {
    wannabe.byPattern (path.join (__dirname, './other.txt'), null, 'it', 13, (err, frames) => {
      expect (err.message).to.match (/Unexpected token.*/);
      done ();
    });
  });
});
