# piper 🛩
  runs multiple shell commands piping their stdin/stdout

# Features

* Automatic pipes stdin & stdout of all processes.
* `exitCode` promise is resolved with exit code of last code in the pipe when last process exit.
* stdin, stdout, stderr of resulting process are returned as stream.
* stdout, stderr of resulting process are also thenable. When they are awaited, they are fullfilled with stream buffer concatenation.
* stderr of all processes is merged in to one.
* Automatic unpipe streams when processes terminate.
* `Error` event of all processes is forwarded to `error` event of the result object.
