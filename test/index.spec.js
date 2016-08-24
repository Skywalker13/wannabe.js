'use strict';

const path     = require ('path');
const {expect} = require ('chai');
const Wannabe  = require ('../lib/index.js');


const goodResult = {
  14: [{
    line: 14,
    payload: {
      arguments: [],
      locals: [{
        name: 'test',
        type: 'string',
        value: 'foo'
      }],
      returnValue: null
    },
    test: {
      line: 13
    }
  }],
  15: [{
    line: 15,
    payload: {
      arguments: [],
      locals: [{
        name: 'test',
        type: 'string',
        value: 'foo'
      }, {
        name: 'a1',
        type: 'string',
        value: 'foo - bar'
      }],
      returnValue: null
    },
    test: {
      line: 13
    }
  }]
};

describe ('index', function () {
  it ('#byPattern (good js)', function (done) {
    const wannabe = new Wannabe (path.join (__dirname, './sample.js'), null, 'it', 'a.1');
    wannabe.run ((err, results) => {
      expect (err).to.be.null;
      expect (results.frames).to.be.eql (goodResult);
      done ();
    });
  });

  it ('#byPattern (bad js)', function (done) {
    const wannabe = new Wannabe (path.join (__dirname, './other.txt'), null, 'it', 'a.1');
    wannabe.run ((err) => {
      expect (err.message).to.match (/Unexpected token.*/);
      done ();
    });
  });

  it ('#byLine (good js)', function (done) {
    const wannabe = new Wannabe (path.join (__dirname, './sample.js'), null, 'it', 15);
    wannabe.run ((err, results) => {
      expect (err).to.be.null;
      expect (results.frames).to.be.eql (goodResult);
      done ();
    });
  });

  it ('#byLine (bad js)', function (done) {
    const wannabe = new Wannabe (path.join (__dirname, './other.txt'), null, 'it', 15);
    wannabe.run ((err) => {
      expect (err.message).to.match (/Unexpected token.*/);
      done ();
    });
  });

  it ('exception', function (done) {
    const wannabe = new Wannabe (path.join (__dirname, './sample.js'), null, 'it', 'b.1');
    wannabe.run ((err, results) => {
      expect (results.frames).to.be.eql ({
        19: [{
          payload: {
            exception: {
              type: 'error',
              text: 'sample error'
            }
          },
          line: 19,
          test: {
            line: 18
          }
        }
      ]});
      done ();
    });
  });

  it ('assert', function (done) {
    const wannabe = new Wannabe (path.join (__dirname, './sample.js'), null, 'it', 'c.1');
    wannabe.run ((err, results) => {
      expect (results.frames).to.be.eql ({
        23: [{
          payload: {
            exception: {
              type: 'object',
              text: 'expected true to be false'
            }
          },
          line: 23,
          test: {
            line: 22
          }
        }]
      });
      done ();
    });
  });

  it ('scopes', function (done) {
    const wannabe = new Wannabe (path.join (__dirname, './sample.js'), null, 'it', 'd.1');
    wannabe.run (() => {
      done ();
    });
  });
});
