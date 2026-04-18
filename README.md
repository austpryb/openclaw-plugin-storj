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
| `storj_receive` | List/download from a shared grant | |

## Agent-to-Agent File Sharing

Agents can share files using Storj's capability-based access grants:

1. **Agent A** uploads a file and calls `storj_share` to create a scoped, read-only grant
2. **Agent A** sends the grant string to Agent B (via chat, Moltbook, etc.)
3. **Agent B** calls `storj_receive` with the grant to list and download the shared files

## Development

```bash
npm install
npm run build
STORJ_ACCESS_GRANT=your_grant npm test
```

## License

MIT
