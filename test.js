import test from "ava";
import getStream from "get-stream";
import { piper, __setTestHook } from ".";

__setTestHook();

const fixture = () =>
  piper(
    ["cat", `${__dirname}/.eslintrc`],
    ["grep", "test"],
    ["sort", "-r"],
    ["wc", "-w"]
  );

test("result has stdin/stdout/stderr", t => {
  const results = fixture();
  t.is(typeof results.stdout, "object");
  t.is(typeof results.stderr, "object");
  t.is(typeof results.stdin, "object");
});

test("run various commands piping their stdin/outs", async t => {
  const results = fixture();
  t.is((await getStream(results.stdout)).trim(), "19");
});

test("stdout/err are thenable", async t => {
  const results = await fixture().stdout;
  t.is(results.toString("utf-8").trim(), "19");
});

/*
test("pipe completes when last command completes", async t => {
  const proc = piper(["echo", "ciao"], ["false"]);
  t.is(await proc.exitCode, 1);
});
*/

test("work when pipeline has one single command", async t => {
  const results = await piper(["echo", "ciao"]).stdout;
  t.is(results.toString("utf-8").trim(), "ciao");
});

test("stderr of process are merged into result", async t => {
  const pipe = piper(
    ["node", `${__dirname}/fixtures/echoerr1.js`],
    ["node", `${__dirname}/fixtures/echoerr2.js`]
  );
  const results = await pipe.stderr;
  t.is(results.toString("utf-8").trim(), "111222333");
});

test("not found commands are skipped from pipe", async t => {
  const pipe = piper(["echo", "ciao"], ["nonexistent1"], ["echo", "cat"]);
  pipe.on("error", () => 0);
  const results = await pipe.stdout;
  t.is(results.toString("utf-8").trim(), "cat");
});

test("`Error` event of all processes is forwarded to `error` event of the result object", async t => {
  const results = piper(["nonexistent2"]);

  const errorThrown = new Promise(resolve => results.on("error", resolve));

  const err = await errorThrown;
  t.is(err.message, "spawn nonexistent2 ENOENT");
});

test("exiting process works", async t => {
  const pipe = piper(
    ["node", `${__dirname}/fixtures/jerk.js`],
    ["echo", "ciao"]
  );
  const results = await pipe.stdout;
  t.is(results.toString("utf-8").trim(), "ciao");
});
