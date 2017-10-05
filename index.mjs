import cp from "child_process";
import getStream from "get-stream";
import pEvent from "p-event";
import merge from "merge2";
import EventEmitter from "events";

const makeThenable = stream => async fn => {
  const completedStream = await getStream.buffer(stream);
  fn(completedStream);
};

export function piper(...commands) {
  const results = new EventEmitter();
  const allStderr = [];
  let prevSubprocess;

  for (const cmd of commands) {
    const subprocess = cp.spawn(cmd[0], cmd.slice(1), {});
    allStderr.push(subprocess.stderr);

    const unpipe = () => {
      prevSubprocess.stdout.unpipe(subprocess.stdin);
    };

    const forwardEvent = err => {
      results.emit("error", err);
    };

    if (!results.stdin) {
      results.stdin = subprocess.stdin;
    }

    subprocess.stdin.on("error", forwardEvent);
    subprocess.stdout.on("error", forwardEvent);
    subprocess.stderr.on("error", forwardEvent);
    subprocess.on("error", forwardEvent);

    if (prevSubprocess) {
      subprocess.once("exit", unpipe);
      prevSubprocess.once("exit", unpipe);
      prevSubprocess.stdout.pipe(subprocess.stdin);
    }

    prevSubprocess = subprocess;
  }

  results.exitCode = pEvent(prevSubprocess, "exit", {
    rejectionEvents: "none"
  });
  results.stdout = prevSubprocess.stdout;
  results.stderr = merge(allStderr, { objectMode: false });

  results.stdout.then = makeThenable(results.stdout);
  results.stderr.then = makeThenable(results.stderr);

  return results;
}
