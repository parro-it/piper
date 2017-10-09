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
  let idx = 0;

  for (const cmd of commands) {
    const stdio = ["pipe", "pipe", "pipe"];
    idx++;

    if (idx === 1) {
      stdio[0] = "inherit";
    }

    if (idx === commands.length) {
      stdio[1] = "inherit";
      stdio[2] = "inherit";
    }

    const subprocess = cp.spawn(cmd[0], cmd.slice(1), { stdio });
    if (subprocess.stderr) {
      allStderr.push(subprocess.stderr);
    }

    const unpipe = () => {
      if (prevSubprocess.stdout) {
        prevSubprocess.stdout.unpipe(subprocess.stdin);
      }
    };

    const forwardEvent = err => {
      results.emit("error", err);
    };

    if (idx === 1) {
      results.stdin = subprocess.stdin;
    }

    if (subprocess.stdin) {
      subprocess.stdin.on("error", forwardEvent);
    }

    if (subprocess.stdout) {
      subprocess.stdout.on("error", forwardEvent);
    }

    if (subprocess.stderr) {
      subprocess.stderr.on("error", forwardEvent);
    }

    subprocess.on("error", forwardEvent);

    if (prevSubprocess) {
      subprocess.once("exit", unpipe);
      prevSubprocess.once("exit", unpipe);
      if (prevSubprocess.stdout && subprocess.stdin) {
        prevSubprocess.stdout.pipe(subprocess.stdin);
      }
    }

    prevSubprocess = subprocess;
  }

  results.exitCode = pEvent(prevSubprocess, "exit", {
    rejectionEvents: "none"
  });
  results.stdout = prevSubprocess.stdout;
  results.stderr = merge(allStderr, { objectMode: false });

  if (results.stdout) {
    results.stdout.then = makeThenable(results.stdout);
  }

  if (results.stderr) {
    results.stderr.then = makeThenable(results.stderr);
  }

  return results;
}
