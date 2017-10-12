"use strict";

setTimeout(() => {
  process.stderr.write("111");
}, 200);

setTimeout(() => {
  process.stderr.write("333");
}, 600);
