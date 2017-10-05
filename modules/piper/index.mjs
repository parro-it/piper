import cp from "child_process";
import getStream from "get-stream";
import pEvent from "p-event";
import merge from "merge2";

export function piper(...commands) {
  const results = {};
  const allStderr = [];
  let lastSubprocess;

  for (const cmd of commands) {
    const subprocess = cp.spawn(cmd[0], cmd.slice(1), {});

    allStderr.push(subprocess.stderr);

    if (!results.stdin) {
      results.stdin = subprocess.stdin;
    }

    subprocess.stdin.on("error", err => {
      console.error("stdin", err);
    });

    subprocess.stdout.on("error", err => {
      console.error("stdout", err);
    });

    subprocess.stderr.on("error", err => {
      console.error("stderr", err);
    });

    subprocess.on("error", err => {
      console.error(err);
    });

    if (lastSubprocess) {
      const unpipe = () => {
        lastSubprocess.stdout.unpipe(subprocess.stdin);
      };

      subprocess.once("exit", unpipe);
      lastSubprocess.once("exit", unpipe);

      lastSubprocess.stdout.pipe(subprocess.stdin);
    }

    lastSubprocess = subprocess;
  }

  results.exitCode = pEvent(lastSubprocess, "exit");
  results.stdout = lastSubprocess.stdout;
  results.stderr = merge(allStderr, { objectMode: false });

  const makeThenable = stream => async fn => {
    const completedStream = await getStream.buffer(stream);
    fn(completedStream);
  };

  results.stdout.then = makeThenable(results.stdout);
  results.stderr.then = makeThenable(results.stderr);

  return results;
}
