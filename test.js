import test from "ava";
import { run, Command } from ".";
import fs from "fs";
import util from "util";

const readFile = util.promisify(fs.readFile);
const unlink = util.promisify(fs.unlink);
const fixtures = `${__dirname}/fixtures`;

test("run return ", t => {
  const results = run("echo", 42);
  t.true(results instanceof Command);
});

test("Command instances have stdin property", t => {
  const results = run("echo", 42);
  t.is(typeof results.stdin, "object");
});

test("Command instances have stdout property", t => {
  const results = run("echo", 42);
  t.is(typeof results.stdout, "object");
});

test("Command instances have stderr property", t => {
  const results = run("echo", 42);
  t.is(typeof results.stderr, "object");
});

test("stdout property is thenable", async t => {
  const results = await run("echo", 42).stdout;
  t.is(results.toString("utf-8").trim(), "42");
});

test("stderr property is thenable", async t => {
  const results = await run("node", `${fixtures}/echoerr2`).stderr;
  t.is(results.toString("utf-8").trim(), "222");
});

test("exitCode property is resolved with process exit code", async t => {
  const falseCmd = await run("false").exitCode;
  const trueCmd = await run("true").exitCode;
  t.is(falseCmd, 1);
  t.is(trueCmd, 0);
});

test("pipe throw after process has started", async t => {
  const proc = run("node", `${fixtures}/echoerr2`);
  await proc.started;
  const err = t.throws(() => proc.pipe());
  t.is(err.message, "You cannot call pipe after process has started.");
});

test("outputTo throw after process has started", async t => {
  const proc = run("node", `${fixtures}/echoerr2`);
  await proc.started;
  const err = t.throws(() => proc.outputTo());
  t.is(err.message, "You cannot call outputTo after process has started.");
});

test("inputFrom throw after process has started", async t => {
  const proc = run("node", `${fixtures}/echoerr2`);
  await proc.started;
  const err = t.throws(() => proc.inputFrom());
  t.is(err.message, "You cannot call inputFrom after process has started.");
});

test("redirectTo throw after process has started", async t => {
  const proc = run("node", `${fixtures}/echoerr2`);
  await proc.started;
  const err = t.throws(() => proc.redirectTo());
  t.is(err.message, "You cannot call redirectTo after process has started.");
});

test("errorTo throw after process has started", async t => {
  const proc = run("node", `${fixtures}/echoerr2`);
  await proc.started;
  const err = t.throws(() => proc.errorTo());
  t.is(err.message, "You cannot call errorTo after process has started.");
});

test("run various commands piping together their stdin/stdouts", async t => {
  const proc = await run("cat", `${__dirname}/.gitignore`)
    .pipe("grep", ["test"])
    .pipe("sort", ["-r"])
    .pipe("wc", ["-w"]);
  await proc.exitCode;
  t.is((await proc.stdout).toString("utf-8").trim(), "4");
});

/* Actually I think this is not correct. Pipe of stederr has its own operator?
test("stderr of process are merged into result", async t => {
  const results = await run("node", `${fixtures}/echoerr1.js`).pipe("node", [
    `${fixtures}/echoerr2.js`
  ]).stderr;
  t.is(results.toString("utf-8").trim(), "111222333");
});
*/
test("exiting process works", async t => {
  const pipe = run("node", `${fixtures}/jerk.js`).pipe("echo", ["ciao"]);
  const results = await pipe.stdout;
  t.is(results.toString("utf-8").trim(), "ciao");
});

test("`Error` event of all processes is forwarded to `error` event of the result object", async t => {
  const results = run("nonexistent2");

  const errorThrown = new Promise(resolve => results.on("error", resolve));

  const err = await errorThrown;
  t.is(err.message, "spawn nonexistent2 ENOENT");
});

test("not found commands are skipped from pipe", async t => {
  const proc = run("echo", "ciao")
    .pipe("nonexistent1")
    .pipe("echo", ["cat"]);

  proc.on("error", () => 0);
  const results = await proc.stdout;
  t.is(results.toString("utf-8").trim(), "cat");
});

test("accept redirection of stdin", async t => {
  const pipe = run("grep", "a").inputFrom(`${fixtures}/lines`);
  const results = await pipe.stdout;
  t.is(results.toString("utf-8").trim(), "aa\nca");
});

test("accept redirection of stdout", async t => {
  await unlink(`/tmp/results1`).catch(() => 0);
  const pipe = run("echo", "ciao123").outputTo(`/tmp/results1`);
  await pipe.exitCode;
  const results = await readFile(`/tmp/results1`);
  t.is(results.toString("utf8").trim(), "ciao123");
});

test("accept redirection of stderr", async t => {
  await unlink(`/tmp/results2`).catch(() => 0);
  const pipe = run("node", `${fixtures}/echoerr2.js`).errorTo(`/tmp/results2`);
  await pipe.exitCode;
  const results = await readFile(`/tmp/results2`);
  t.is(results.toString("utf8").trim(), "222");
});

/* Not implemented yet
test.only("Support pty escapes", async t => {
  const colorLsArgs = process.platform === "darwin" ? "-G" : "--color";

  const results = await run("ls", colorLsArgs, fixtures).stdout;
  const output = results.toString("utf8").trim();
  const expected = "dir\nechoerr1.js\nechoerr2.js\njerk.js\nlines";
  // console.log("*" + output + "*", "*" + expected + "*", output == expected);
  t.is(output, expected);
});
*/
