'use strict';

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
});
