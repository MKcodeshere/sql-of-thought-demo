node:internal/modules/cjs/loader:1921
  return process.dlopen(module, path.toNamespacedPath(filename));
                 ^

Error: /mnt/c/research/sql-of-thought-demo/node_modules/duckdb/lib/binding/duckdb.node: invalid ELF header
    at Object..node (node:internal/modules/cjs/loader:1921:18)
    at Module.load (node:internal/modules/cjs/loader:1465:32)
    at Function._load (node:internal/modules/cjs/loader:1282:12)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
    at Module.require (node:internal/modules/cjs/loader:1487:12)
    at require (node:internal/modules/helpers:135:16)
    at Object.<anonymous> (/mnt/c/research/sql-of-thought-demo/node_modules/duckdb/lib/duckdb-binding.js:4:15)
    at Module._compile (node:internal/modules/cjs/loader:1730:14)
    at Object..js (node:internal/modules/cjs/loader:1895:10) {
  code: 'ERR_DLOPEN_FAILED'
}

Node.js v22.17.1
