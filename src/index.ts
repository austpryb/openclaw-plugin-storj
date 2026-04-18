/**
 * OpenClaw Storj Plugin
 *
 * Provides tools for managing Storj decentralized cloud storage:
 * list buckets, list/stat/delete objects, upload, download, and share.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { StorjClient, StorjError } from "./uplink.js";
import type { ObjectInfo, BucketInfo } from "./uplink.js";
// @ts-ignore — resolved by the openclaw jiti loader via alias map
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(epoch: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toISOString().replace("T", " ").replace(/\.\d+Z/, " UTC");
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { text },
  };
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

function errorResult(err: unknown): ReturnType<typeof textResult> {
  const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
  return textResult(`Error: ${message}`);
}

function getClient(pluginConfig: Record<string, unknown> | undefined): StorjClient {
  const grant =
    (pluginConfig?.accessGrant as string) || process.env.STORJ_ACCESS_GRANT;
  if (!grant || typeof grant !== "string") {
    throw new Error(
      "No Storj access grant configured. Set it via:\n" +
      '  openclaw config set plugins.entries.storj.config.accessGrant "YOUR_GRANT"\n' +
      "or set the STORJ_ACCESS_GRANT environment variable."
    );
  }
  return StorjClient.open(grant);
}

export default definePluginEntry({
  id: "storj",
  name: "Storj Storage",
  description: "Manage files on Storj decentralized cloud storage — upload, download, list, share",

  register(api: any) {
    const pluginConfig = api.pluginConfig;

    // -----------------------------------------------------------------------
    // storj_list_buckets
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_list_buckets",
      label: "List Storj Buckets",
      description: "List all buckets in the Storj project.",
      displaySummary: "List all Storj buckets",
      parameters: { type: "object" as const, properties: {}, additionalProperties: false },
      async execute(_toolCallId: string) {
        const client = getClient(pluginConfig);
        try {
          const buckets = client.listBuckets();
          if (buckets.length === 0) {
            return textResult("No buckets found.");
          }
          const lines = buckets.map(
            (b: BucketInfo) => `- **${b.name}** (created ${formatDate(b.created)})`
          );
          return textResult(`Found ${buckets.length} bucket(s):\n\n${lines.join("\n")}`);
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_create_bucket
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_create_bucket",
      label: "Create Storj Bucket",
      description: "Create a new bucket in the Storj project.",
      displaySummary: "Create a Storj bucket",
      ownerOnly: true,
      parameters: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Bucket name" },
        },
        required: ["name"],
        additionalProperties: false,
      },
      async execute(_toolCallId: string, params: { name: string }) {
        const client = getClient(pluginConfig);
        try {
          const bucket = client.createBucket(params.name);
          return textResult(`Bucket **${bucket.name}** created.`);
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_delete_bucket
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_delete_bucket",
      label: "Delete Storj Bucket",
      description: "Delete an empty bucket from the Storj project.",
      displaySummary: "Delete a Storj bucket",
      ownerOnly: true,
      parameters: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Bucket name to delete" },
        },
        required: ["name"],
        additionalProperties: false,
      },
      async execute(_toolCallId: string, params: { name: string }) {
        const client = getClient(pluginConfig);
        try {
          client.deleteBucket(params.name);
          return textResult(`Bucket **${params.name}** deleted.`);
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_list_objects
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_list_objects",
      label: "List Storj Objects",
      description:
        "List objects in a Storj bucket. Optionally filter by prefix. Returns key, size, and creation date.",
      displaySummary: "List objects in a Storj bucket",
      parameters: {
        type: "object" as const,
        properties: {
          bucket: { type: "string", description: "Bucket name" },
          prefix: { type: "string", description: "Filter by key prefix (optional)" },
          recursive: {
            type: "boolean",
            description: "List recursively (default true)",
          },
        },
        required: ["bucket"],
        additionalProperties: false,
      },
      async execute(
        _toolCallId: string,
        params: { bucket: string; prefix?: string; recursive?: boolean }
      ) {
        const client = getClient(pluginConfig);
        try {
          const objects = client.listObjects(params.bucket, {
            prefix: params.prefix,
            recursive: params.recursive,
          });
          if (objects.length === 0) {
            return textResult(
              `No objects found in **${params.bucket}**${params.prefix ? ` with prefix "${params.prefix}"` : ""}.`
            );
          }
          const lines = objects.map((o: ObjectInfo) =>
            o.isPrefix
              ? `- \`${o.key}\` (prefix/folder)`
              : `- \`${o.key}\` — ${formatBytes(o.contentLength)}, created ${formatDate(o.created)}`
          );
          return textResult(
            `Found ${objects.length} object(s) in **${params.bucket}**:\n\n${lines.join("\n")}`
          );
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_stat_object
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_stat_object",
      label: "Get Storj Object Info",
      description: "Get metadata for a specific object in a Storj bucket.",
      displaySummary: "Get Storj object metadata",
      parameters: {
        type: "object" as const,
        properties: {
          bucket: { type: "string", description: "Bucket name" },
          key: { type: "string", description: "Object key/path" },
        },
        required: ["bucket", "key"],
        additionalProperties: false,
      },
      async execute(_toolCallId: string, params: { bucket: string; key: string }) {
        const client = getClient(pluginConfig);
        try {
          const obj = client.statObject(params.bucket, params.key);
          return jsonResult({
            key: obj.key,
            size: formatBytes(obj.contentLength),
            sizeBytes: obj.contentLength,
            created: formatDate(obj.created),
            expires: obj.expires ? formatDate(obj.expires) : null,
          });
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_delete_object
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_delete_object",
      label: "Delete Storj Object",
      description: "Delete an object from a Storj bucket.",
      displaySummary: "Delete a Storj object",
      ownerOnly: true,
      parameters: {
        type: "object" as const,
        properties: {
          bucket: { type: "string", description: "Bucket name" },
          key: { type: "string", description: "Object key/path to delete" },
        },
        required: ["bucket", "key"],
        additionalProperties: false,
      },
      async execute(_toolCallId: string, params: { bucket: string; key: string }) {
        const client = getClient(pluginConfig);
        try {
          client.deleteObject(params.bucket, params.key);
          return textResult(`Deleted **${params.key}** from **${params.bucket}**.`);
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_upload
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_upload",
      label: "Upload to Storj",
      description:
        "Upload a local file to a Storj bucket. Provide the local file path and the destination bucket/key.",
      displaySummary: "Upload a file to Storj",
      ownerOnly: true,
      parameters: {
        type: "object" as const,
        properties: {
          localPath: {
            type: "string",
            description: "Absolute path to the local file to upload",
          },
          bucket: { type: "string", description: "Destination bucket name" },
          key: {
            type: "string",
            description: "Destination object key/path. If omitted, uses the filename.",
          },
        },
        required: ["localPath", "bucket"],
        additionalProperties: false,
      },
      async execute(
        _toolCallId: string,
        params: { localPath: string; bucket: string; key?: string }
      ) {
        const client = getClient(pluginConfig);
        try {
          const data = readFileSync(params.localPath);
          const key = params.key ?? basename(params.localPath);
          client.uploadBytes(params.bucket, key, Buffer.from(data));
          return textResult(
            `Uploaded **${key}** to **${params.bucket}** (${formatBytes(data.length)}).`
          );
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_download
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_download",
      label: "Download from Storj",
      description: "Download an object from a Storj bucket to a local file.",
      displaySummary: "Download a file from Storj",
      ownerOnly: true,
      parameters: {
        type: "object" as const,
        properties: {
          bucket: { type: "string", description: "Source bucket name" },
          key: { type: "string", description: "Object key/path to download" },
          localPath: {
            type: "string",
            description: "Absolute path where the file should be saved locally",
          },
        },
        required: ["bucket", "key", "localPath"],
        additionalProperties: false,
      },
      async execute(
        _toolCallId: string,
        params: { bucket: string; key: string; localPath: string }
      ) {
        const client = getClient(pluginConfig);
        try {
          const data = client.downloadBytes(params.bucket, params.key);
          writeFileSync(params.localPath, data);
          return textResult(
            `Downloaded **${params.key}** from **${params.bucket}** to \`${params.localPath}\` (${formatBytes(data.length)}).`
          );
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_share
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_share",
      label: "Create Storj Share",
      description:
        "Create a restricted access grant for sharing a bucket or prefix. " +
        "Returns a serialized access grant string that can be given to others.",
      displaySummary: "Create a restricted Storj access grant",
      ownerOnly: true,
      parameters: {
        type: "object" as const,
        properties: {
          bucket: { type: "string", description: "Bucket to share" },
          prefix: {
            type: "string",
            description: 'Key prefix to restrict sharing to (default "")',
          },
          allowDownload: {
            type: "boolean",
            description: "Allow downloads (default true)",
          },
          allowList: {
            type: "boolean",
            description: "Allow listing (default true)",
          },
        },
        required: ["bucket"],
        additionalProperties: false,
      },
      async execute(
        _toolCallId: string,
        params: {
          bucket: string;
          prefix?: string;
          allowDownload?: boolean;
          allowList?: boolean;
        }
      ) {
        const client = getClient(pluginConfig);
        try {
          const grant = client.createShareGrant(params.bucket, params.prefix ?? "", {
            allowDownload: params.allowDownload,
            allowList: params.allowList,
          });
          return textResult(
            `Restricted access grant for **${params.bucket}/${params.prefix ?? ""}**:\n\n\`\`\`\n${grant}\n\`\`\`\n\nShare this grant with others so they can access the specified path.`
          );
        } catch (err) {
          return errorResult(err);
        } finally {
          client.close();
        }
      },
    });

    // -----------------------------------------------------------------------
    // storj_receive
    // -----------------------------------------------------------------------
    api.registerTool({
      name: "storj_receive",
      label: "Receive Shared Storj Files",
      description:
        "Open a shared Storj access grant to list and optionally download the files it provides. " +
        "Use this when another agent or user shares an access grant string with you.",
      displaySummary: "Browse/download files from a shared Storj access grant",
      parameters: {
        type: "object" as const,
        properties: {
          accessGrant: {
            type: "string",
            description: "The shared Storj access grant string",
          },
          download: {
            type: "boolean",
            description: "Download all files to localDir (default false — just list)",
          },
          localDir: {
            type: "string",
            description: "Local directory to download files into (required if download is true)",
          },
        },
        required: ["accessGrant"],
        additionalProperties: false,
      },
      async execute(
        _toolCallId: string,
        params: { accessGrant: string; download?: boolean; localDir?: string }
      ) {
        let client: StorjClient | null = null;
        try {
          client = StorjClient.open(params.accessGrant);
          const buckets = client.listBuckets();

          if (buckets.length === 0) {
            return textResult("Shared grant contains no accessible buckets.");
          }

          const allObjects: { bucket: string; key: string; size: number }[] = [];
          for (const b of buckets) {
            const objects = client.listObjects(b.name, { recursive: true });
            for (const o of objects) {
              if (!o.isPrefix) {
                allObjects.push({ bucket: b.name, key: o.key, size: o.contentLength });
              }
            }
          }

          if (allObjects.length === 0) {
            return textResult(
              `Shared grant provides access to bucket(s): ${buckets.map(b => b.name).join(", ")} — but no files found.`
            );
          }

          const listing = allObjects.map(
            o => `- \`${o.bucket}/${o.key}\` (${formatBytes(o.size)})`
          );

          if (!params.download) {
            return textResult(
              `Shared grant contains ${allObjects.length} file(s):\n\n${listing.join("\n")}\n\n` +
              `To download, call this tool again with \`download: true\` and a \`localDir\`.`
            );
          }

          if (!params.localDir) {
            return textResult("Error: localDir is required when download is true.");
          }

          const { mkdirSync } = await import("node:fs");
          const { join, dirname } = await import("node:path");

          let downloaded = 0;
          for (const o of allObjects) {
            const dest = join(params.localDir, o.bucket, o.key);
            mkdirSync(dirname(dest), { recursive: true });
            const data = client.downloadBytes(o.bucket, o.key);
            writeFileSync(dest, data);
            downloaded++;
          }

          return textResult(
            `Downloaded ${downloaded} file(s) to \`${params.localDir}\`:\n\n${listing.join("\n")}`
          );
        } catch (err) {
          return errorResult(err);
        } finally {
          client?.close();
        }
      },
    });
  },
});
