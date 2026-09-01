# openclaw-plugin-storj

Storj decentralized storage plugin for [OpenClaw](https://openclaw.ai). Upload, download, list, share, and receive files on [Storj](https://storj.io) — powered by native FFI bindings to [uplink-c](https://github.com/storj/uplink-c).

## Prerequisites

1. **Storj account** — sign up at [storj.io](https://storj.io) and create an access grant from the satellite UI or via the `uplink` CLI.

2. **Native library** — this plugin requires the `libuplink` shared library:
   - **Linux:** `libuplink.so`
   - **macOS:** `libuplink.dylib`
   - **Windows:** `libuplink.dll`

   Build it from [storj/uplink-c](https://github.com/storj/uplink-c) (`make build`) or download a prebuilt binary. Place it in the plugin's `native/` directory or set `STORJ_LIBUPLINK_PATH`.

## Install

```bash
openclaw plugins install clawhub:openclaw-plugin-storj
```

Then enable and configure:

```bash
openclaw plugins enable storj
openclaw config set plugins.entries.storj.config.accessGrant "YOUR_ACCESS_GRANT"
```

Or set the environment variable:

```bash
export STORJ_ACCESS_GRANT="YOUR_ACCESS_GRANT"
```

## Tools

| Tool | Description | Owner Only |
|------|-------------|:----------:|
| `storj_list_buckets` | List all buckets | |
| `storj_create_bucket` | Create a bucket | Yes |
| `storj_delete_bucket` | Delete an empty bucket | Yes |
| `storj_list_objects` | List objects (with prefix filter) | |
| `storj_stat_object` | Get object metadata | |
| `storj_delete_object` | Delete an object | Yes |
| `storj_upload` | Upload a local file | Yes |
| `storj_download` | Download to a local file | Yes |
| `storj_share` | Create a restricted access grant | Yes |
| `storj_receive` | List/download from a shared grant (pass `prefix` for prefix-scoped grants) | |

## Agent-to-Agent File Sharing

Agents can share files using Storj's capability-based access grants:

1. **Agent A** uploads a file and calls `storj_share` to create a scoped, read-only grant
2. **Agent A** sends the grant string to Agent B (via chat, Moltbook, etc.)
3. **Agent B** calls `storj_receive` with the grant — plus the `prefix` it was scoped to — to list and download the shared files

The grant is a macaroon: the prefix caveat is enforced by the network, not by this plugin. A grant scoped to `bucket/prefix/` denies an unscoped listing, which is why `storj_receive` takes a `prefix` argument.

## Development

```bash
npm install
npm run build
STORJ_ACCESS_GRANT=your_grant npm test
```

## License

MIT

## Changelog

### 0.1.2

- **Fix: `storj_share` crashed the agent process.** `UplinkStringResult.string` was
  declared as koffi's `str`, so passing the struct back to
  `uplink_free_string_result()` handed C a JS-allocated pointer to `free()` —
  heap corruption and a SIGSEGV. The field is now a raw pointer decoded with
  `koffi.decode(ptr, "char", -1)`.
- **Fix: `storj_receive` failed on the grants `storj_share` produces.** It listed
  without a prefix, which a prefix-scoped macaroon denies. It now accepts a
  `prefix` argument and degrades per bucket instead of failing outright.
- **Fix: real download errors were reported as end-of-stream.** `uplink_download_read`
  signals EOF as an `UplinkError` with code `-1` and a NULL message; any error was
  treated as EOF, so a mid-transfer failure silently returned a truncated file.
- **Fix: `uplink_free_upload_result` / `uplink_free_download_result` were called but
  never bound**, so upload and download error paths threw
  `fn.free_… is not a function` instead of the actual Storj error.
- Free write/read results and abort uploads on failure instead of leaking them;
  `uploadBytes` no longer spins forever if uplink accepts 0 bytes.
- `uploadBytes` reports `created` in epoch seconds, matching every other timestamp.
