_f55‍.e([["piper",()=>piper]]);let cp;_f55‍.w("child_process",[["default",function(v){cp=v}]]);let getStream;_f55‍.w("get-stream",[["default",function(v){getStream=v}]]);let pEvent;_f55‍.w("p-event",[["default",function(v){pEvent=v}]]);let merge;_f55‍.w("merge2",[["default",function(v){merge=v}]]);let EventEmitter;_f55‍.w("events",[["default",function(v){EventEmitter=v}]]);





const makeThenable = stream => async fn => {
  const completedStream = await getStream.buffer(stream);
  fn(completedStream);
};

function piper(...commands) {
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
