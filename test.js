import test from "ava";
import getStream from "get-stream";
import { piper } from "./modules/piper";

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
	t.is(await getStream(results.stdout), "      19\n");
});

test("stdout/err are thenable", async t => {
	const results = await fixture().stdout;
	t.is(results.toString("utf-8"), "      19\n");
});

test("pipe completes when last command completes", async t => {
	const proc = piper(["echo", "ciao"], ["/usr/bin/false"]);
	t.is(await proc.exitCode, 1);
});

test("work when pipeline has one single command", async t => {
	const results = await piper(["echo", "ciao"]).stdout;
	t.is(results.toString("utf-8"), "ciao\n");
});
