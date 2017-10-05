"use strict";

setTimeout(() => {
  process.stderr.write("111");
}, 100);

setTimeout(() => {
  process.stderr.write("333");
}, 300);
