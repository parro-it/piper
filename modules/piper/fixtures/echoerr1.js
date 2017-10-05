"use strict";

setTimeout(() => {
  process.stderr.write("111");
}, 10);

setTimeout(() => {
  process.stderr.write("333");
}, 30);
