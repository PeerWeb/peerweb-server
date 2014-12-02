PeerWeb Server (+ Client)
=========================

PeerWeb content server. When run, pages in `src/` are converted into PeerWeb "shell" pages and
copied into the root.

Dependencies
------------

The content server requires [Node.js][node]. Additional dependencies can be installed using the
provided `node_setup.sh` script, which uses `npm` to install dependencies locally (typically to a
directory called `node_modules`).

Running
-------

```sh
node ./server.js
```

[node]:   http://nodejs.org/
