'use strict';
/* jshint -W030 */

const path     = require ('path');
const {expect} = require ('chai');
const wannabe  = require ('../lib/index.js');


const goodResult = {
  14: [{
    arguments: [],
    line: 14,
    locals: [{
      name: 'test',
      type: 'string',
      value: 'foo'
    }],
    returnValue: null
  }],
  15: [{
    arguments: [],
    line: 15,
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
  }]
};

describe ('index', function () {
  it ('#byPattern (good js)', function (done) {
    wannabe.byPattern (path.join (__dirname, './sample.js'), null, 'it', 'a.1', (err, results) => {
      expect (err).to.be.null;
      expect (results.frames).to.be.eql (goodResult);
      done ();
    });
  });

  it ('#byPattern (bad js)', function (done) {
    wannabe.byPattern (path.join (__dirname, './other.txt'), null, 'it', 'a.1', (err) => {
      expect (err.message).to.match (/Unexpected token.*/);
      done ();
    });
  });

  it ('#byLine (good js)', function (done) {
    wannabe.byLine (path.join (__dirname, './sample.js'), null, 'it', 15, (err, results) => {
      expect (err).to.be.null;
      expect (results.frames).to.be.eql (goodResult);
      done ();
    });
  });

  it ('#byLine (bad js)', function (done) {
    wannabe.byPattern (path.join (__dirname, './other.txt'), null, 'it', 15, (err) => {
      expect (err.message).to.match (/Unexpected token.*/);
      done ();
    });
  });

  it ('exception', function (done) {
    wannabe.byPattern (path.join (__dirname, './sample.js'), null, 'it', 'b.1', (err, results) => {
      expect (results.frames).to.be.eql ({
        19: [{
          exception: {
            type: 'error',
            text: 'sample error'
          },
          line: 19
        }
      ]});
      done ();
    });
  });

  it ('assert', function (done) {
    wannabe.byPattern (path.join (__dirname, './sample.js'), null, 'it', 'c.1', (err, results) => {
      expect (results.frames).to.be.eql ({
        23: [{
          exception: {
            type: 'object',
            text: 'expected true to be false'
          },
          line: 23
        }]
      });
      done ();
    });
  });

  it ('scopes', function (done) {
    wannabe.byPattern (path.join (__dirname, './sample.js'), null, 'it', 'd.1', () => {
      done ();
    });
  });
});
