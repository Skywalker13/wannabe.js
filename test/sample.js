'use strict';

const {expect} = require ('chai');

function get (v) {
  switch (v) {
  case 1: return 'foo';
  case 2: return 'bar';
  }
}

describe ('a', function () {
  it ('a.1', function () {
    let test = get (1);
    let a1 = test + ' - ' + get (2);
  });

  it ('b.1', function () {
    throw new Error ('sample error');
  });

  it ('c.1', function () {
    expect (true).to.be.false;
  });
});
