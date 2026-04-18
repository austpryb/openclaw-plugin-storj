/**
 * Storj uplink-c FFI bindings via koffi.
 *
 * Key koffi pattern: handle types are opaque pointers. Functions that return
 * struct pointers need koffi.decode() to read the struct fields.
 */
import koffi from "koffi";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");

// ---------------------------------------------------------------------------
// Library loading (lazy — loaded on first StorjClient.open())
// ---------------------------------------------------------------------------

let _lib: ReturnType<typeof koffi.load> | null = null;

function getLib() {
  if (_lib) return _lib;
  _lib = koffi.load(findLibrary());
  defineBindings(_lib);
  return _lib;
}

function findLibrary(): string {
  if (process.env.STORJ_LIBUPLINK_PATH) {
    return process.env.STORJ_LIBUPLINK_PATH;
  }

  const candidates = [
    join(__dirname, "..", "native", "libuplink.so"),
    join(__dirname, "..", "native", "libuplink.dylib"),
    join(__dirname, "..", "native", "libuplink.dll"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    "libuplink not found. Set STORJ_LIBUPLINK_PATH or place the library in the plugin native/ directory."
  );
}

// ---------------------------------------------------------------------------
// Struct definitions
// ---------------------------------------------------------------------------

// Opaque handle types
const UplinkAccess = koffi.opaque("UplinkAccess");
const UplinkProject = koffi.opaque("UplinkProject");
const UplinkDownload = koffi.opaque("UplinkDownload");
const UplinkUpload = koffi.opaque("UplinkUpload");
const UplinkBucketIterator = koffi.opaque("UplinkBucketIterator");
const UplinkObjectIterator = koffi.opaque("UplinkObjectIterator");

// Data structs
const UplinkError = koffi.struct("UplinkError", {
  code: "int32",
  message: "str",
});

const UplinkBucket = koffi.struct("UplinkBucket", {
  name: "str",
  created: "int64",
});

const UplinkSystemMetadata = koffi.struct("UplinkSystemMetadata", {
  created: "int64",
  expires: "int64",
  content_length: "int64",
});

const UplinkCustomMetadataEntry = koffi.struct("UplinkCustomMetadataEntry", {
  key: "str",
  key_length: "size_t",
  value: "str",
  value_length: "size_t",
});

const UplinkCustomMetadata = koffi.struct("UplinkCustomMetadata", {
  entries: koffi.pointer(UplinkCustomMetadataEntry),
  count: "size_t",
});

const UplinkObject = koffi.struct("UplinkObject", {
  key: "str",
  is_prefix: "bool",
  system: UplinkSystemMetadata,
  custom: UplinkCustomMetadata,
});

const UplinkListObjectsOptions = koffi.struct("UplinkListObjectsOptions", {
  prefix: "str",
  cursor: "str",
  recursive: "bool",
  system: "bool",
  custom: "bool",
});

const UplinkListBucketsOptions = koffi.struct("UplinkListBucketsOptions", {
  cursor: "str",
});

const UplinkPermission = koffi.struct("UplinkPermission", {
  allow_download: "bool",
  allow_upload: "bool",
  allow_list: "bool",
  allow_delete: "bool",
  not_before: "int64",
  not_after: "int64",
});

const UplinkSharePrefix = koffi.struct("UplinkSharePrefix", {
  bucket: "str",
  prefix: "str",
});

// Result structs
const UplinkAccessResult = koffi.struct("UplinkAccessResult", {
  access: koffi.pointer(UplinkAccess),
  error: koffi.pointer(UplinkError),
});

const UplinkProjectResult = koffi.struct("UplinkProjectResult", {
  project: koffi.pointer(UplinkProject),
  error: koffi.pointer(UplinkError),
});

const UplinkBucketResult = koffi.struct("UplinkBucketResult", {
  bucket: koffi.pointer(UplinkBucket),
  error: koffi.pointer(UplinkError),
});

const UplinkObjectResult = koffi.struct("UplinkObjectResult", {
  object: koffi.pointer(UplinkObject),
  error: koffi.pointer(UplinkError),
});

const UplinkUploadResult = koffi.struct("UplinkUploadResult", {
  upload: koffi.pointer(UplinkUpload),
  error: koffi.pointer(UplinkError),
});

const UplinkDownloadResult = koffi.struct("UplinkDownloadResult", {
  download: koffi.pointer(UplinkDownload),
  error: koffi.pointer(UplinkError),
});

const UplinkWriteResult = koffi.struct("UplinkWriteResult", {
  bytes_written: "size_t",
  error: koffi.pointer(UplinkError),
});

const UplinkReadResult = koffi.struct("UplinkReadResult", {
  bytes_read: "size_t",
  error: koffi.pointer(UplinkError),
});

const UplinkStringResult = koffi.struct("UplinkStringResult", {
  string: "str",
  error: koffi.pointer(UplinkError),
});

// ---------------------------------------------------------------------------
// Function bindings (lazy — populated by defineBindings)
// ---------------------------------------------------------------------------

let fn: Record<string, ReturnType<ReturnType<typeof koffi.load>["func"]>> = {};

function defineBindings(lib: ReturnType<typeof koffi.load>) {
  fn = {
    // Access
    parse_access: lib.func("UplinkAccessResult uplink_parse_access(const char *)"),
    access_serialize: lib.func("UplinkStringResult uplink_access_serialize(UplinkAccess *)"),
    access_share: lib.func("UplinkAccessResult uplink_access_share(UplinkAccess *, UplinkPermission, UplinkSharePrefix *, size_t)"),
    free_access_result: lib.func("void uplink_free_access_result(UplinkAccessResult)"),

    // Project
    open_project: lib.func("UplinkProjectResult uplink_open_project(UplinkAccess *)"),
    close_project: lib.func("void * uplink_close_project(UplinkProject *)"),

    // Buckets
    ensure_bucket: lib.func("UplinkBucketResult uplink_ensure_bucket(UplinkProject *, const char *)"),
    delete_bucket: lib.func("UplinkBucketResult uplink_delete_bucket(UplinkProject *, const char *)"),
    list_buckets: lib.func("UplinkBucketIterator * uplink_list_buckets(UplinkProject *, UplinkListBucketsOptions *)"),
    bucket_iterator_next: lib.func("bool uplink_bucket_iterator_next(UplinkBucketIterator *)"),
    bucket_iterator_item: lib.func("void * uplink_bucket_iterator_item(UplinkBucketIterator *)"),
    bucket_iterator_err: lib.func("void * uplink_bucket_iterator_err(UplinkBucketIterator *)"),
    free_bucket_iterator: lib.func("void uplink_free_bucket_iterator(UplinkBucketIterator *)"),
    free_bucket_result: lib.func("void uplink_free_bucket_result(UplinkBucketResult)"),
    free_bucket: lib.func("void uplink_free_bucket(void *)"),

    // Objects
    stat_object: lib.func("UplinkObjectResult uplink_stat_object(UplinkProject *, const char *, const char *)"),
    delete_object: lib.func("UplinkObjectResult uplink_delete_object(UplinkProject *, const char *, const char *)"),
    list_objects: lib.func("UplinkObjectIterator * uplink_list_objects(UplinkProject *, const char *, UplinkListObjectsOptions *)"),
    object_iterator_next: lib.func("bool uplink_object_iterator_next(UplinkObjectIterator *)"),
    object_iterator_item: lib.func("void * uplink_object_iterator_item(UplinkObjectIterator *)"),
    object_iterator_err: lib.func("void * uplink_object_iterator_err(UplinkObjectIterator *)"),
    free_object_iterator: lib.func("void uplink_free_object_iterator(UplinkObjectIterator *)"),
    free_object_result: lib.func("void uplink_free_object_result(UplinkObjectResult)"),
    free_object: lib.func("void uplink_free_object(void *)"),

    // Upload
    upload_object: lib.func("UplinkUploadResult uplink_upload_object(UplinkProject *, const char *, const char *, void *)"),
    upload_write: lib.func("UplinkWriteResult uplink_upload_write(UplinkUpload *, void *, size_t)"),
    upload_commit: lib.func("void * uplink_upload_commit(UplinkUpload *)"),
    upload_abort: lib.func("void * uplink_upload_abort(UplinkUpload *)"),

    // Download
    download_object: lib.func("UplinkDownloadResult uplink_download_object(UplinkProject *, const char *, const char *, void *)"),
    download_read: lib.func("UplinkReadResult uplink_download_read(UplinkDownload *, void *, size_t)"),
    close_download: lib.func("void * uplink_close_download(UplinkDownload *)"),

    // Free
    free_string_result: lib.func("void uplink_free_string_result(UplinkStringResult)"),
    free_error: lib.func("void uplink_free_error(void *)"),
  };
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export class StorjError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "StorjError";
    this.code = code;
  }
}

function throwIfError(errPtr: unknown, fallback: string): void {
  if (errPtr) {
    const err = koffi.decode(errPtr, UplinkError);
    throw new StorjError(err.code, err.message ?? fallback);
  }
}

function checkRawError(errPtr: unknown, fallback: string): void {
  if (errPtr) {
    const err = koffi.decode(errPtr, UplinkError);
    if (err.code !== 0) {
      fn.free_error(errPtr);
      throw new StorjError(err.code, err.message ?? fallback);
    }
    fn.free_error(errPtr);
  }
}

// ---------------------------------------------------------------------------
// High-level API
// ---------------------------------------------------------------------------

export interface BucketInfo {
  name: string;
  created: number;
}

export interface ObjectInfo {
  key: string;
  isPrefix: boolean;
  contentLength: number;
  created: number;
  expires: number;
}

export class StorjClient {
  private accessPtr: unknown;
  private projectPtr: unknown;

  private constructor(accessPtr: unknown, projectPtr: unknown) {
    this.accessPtr = accessPtr;
    this.projectPtr = projectPtr;
  }

  static open(accessGrant: string): StorjClient {
    getLib(); // ensure bindings are loaded

    const accessResult = fn.parse_access(accessGrant);
    throwIfError(accessResult.error, "Failed to parse access grant");

    const projectResult = fn.open_project(accessResult.access);
    if (projectResult.error) {
      fn.free_access_result(accessResult);
      const err = koffi.decode(projectResult.error, UplinkError);
      throw new StorjError(err.code, err.message ?? "Failed to open project");
    }

    return new StorjClient(accessResult.access, projectResult.project);
  }

  close(): void {
    if (this.projectPtr) {
      const errPtr = fn.close_project(this.projectPtr);
      this.projectPtr = null;
      if (errPtr) fn.free_error(errPtr);
    }
    this.accessPtr = null;
  }

  // -- Buckets --

  listBuckets(): BucketInfo[] {
    const it = fn.list_buckets(this.projectPtr, { cursor: null });
    const buckets: BucketInfo[] = [];

    try {
      while (fn.bucket_iterator_next(it)) {
        const bPtr = fn.bucket_iterator_item(it);
        if (bPtr) {
          const b = koffi.decode(bPtr, UplinkBucket);
          buckets.push({ name: b.name, created: Number(b.created) });
          fn.free_bucket(bPtr);
        }
      }
      const errPtr = fn.bucket_iterator_err(it);
      if (errPtr) {
        const err = koffi.decode(errPtr, UplinkError);
        if (err.code !== 0) {
          throw new StorjError(err.code, err.message ?? "Bucket list error");
        }
      }
    } finally {
      fn.free_bucket_iterator(it);
    }

    return buckets;
  }

  createBucket(name: string): BucketInfo {
    const result = fn.ensure_bucket(this.projectPtr, name);
    if (result.error) {
      const err = koffi.decode(result.error, UplinkError);
      fn.free_bucket_result(result);
      throw new StorjError(err.code, err.message ?? "Failed to create bucket");
    }
    const b = koffi.decode(result.bucket, UplinkBucket);
    const info = { name: b.name, created: Number(b.created) };
    fn.free_bucket_result(result);
    return info;
  }

  deleteBucket(name: string): void {
    const result = fn.delete_bucket(this.projectPtr, name);
    if (result.error) {
      const err = koffi.decode(result.error, UplinkError);
      fn.free_bucket_result(result);
      throw new StorjError(err.code, err.message ?? "Failed to delete bucket");
    }
    fn.free_bucket_result(result);
  }

  // -- Objects --

  listObjects(bucket: string, opts?: { prefix?: string; recursive?: boolean }): ObjectInfo[] {
    const listOpts = {
      prefix: opts?.prefix ?? null,
      cursor: null,
      recursive: opts?.recursive ?? true,
      system: true,
      custom: false,
    };

    const it = fn.list_objects(this.projectPtr, bucket, listOpts);
    const objects: ObjectInfo[] = [];

    try {
      while (fn.object_iterator_next(it)) {
        const objPtr = fn.object_iterator_item(it);
        if (objPtr) {
          const obj = koffi.decode(objPtr, UplinkObject);
          objects.push({
            key: obj.key,
            isPrefix: obj.is_prefix,
            contentLength: Number(obj.system.content_length),
            created: Number(obj.system.created),
            expires: Number(obj.system.expires),
          });
          fn.free_object(objPtr);
        }
      }
      const errPtr = fn.object_iterator_err(it);
      if (errPtr) {
        const err = koffi.decode(errPtr, UplinkError);
        if (err.code !== 0) {
          throw new StorjError(err.code, err.message ?? "Object list error");
        }
      }
    } finally {
      fn.free_object_iterator(it);
    }

    return objects;
  }

  statObject(bucket: string, key: string): ObjectInfo {
    const result = fn.stat_object(this.projectPtr, bucket, key);
    if (result.error) {
      const err = koffi.decode(result.error, UplinkError);
      fn.free_object_result(result);
      throw new StorjError(err.code, err.message ?? "Object not found");
    }
    const obj = koffi.decode(result.object, UplinkObject);
    const info: ObjectInfo = {
      key: obj.key,
      isPrefix: obj.is_prefix,
      contentLength: Number(obj.system.content_length),
      created: Number(obj.system.created),
      expires: Number(obj.system.expires),
    };
    fn.free_object_result(result);
    return info;
  }

  deleteObject(bucket: string, key: string): void {
    const result = fn.delete_object(this.projectPtr, bucket, key);
    if (result.error) {
      const err = koffi.decode(result.error, UplinkError);
      fn.free_object_result(result);
      throw new StorjError(err.code, err.message ?? "Failed to delete object");
    }
    fn.free_object_result(result);
  }

  // -- Upload --

  uploadBytes(bucket: string, key: string, data: Buffer): ObjectInfo {
    const uploadResult = fn.upload_object(this.projectPtr, bucket, key, null);
    if (uploadResult.error) {
      const err = koffi.decode(uploadResult.error, UplinkError);
      fn.free_upload_result(uploadResult);
      throw new StorjError(err.code, err.message ?? "Failed to start upload");
    }

    const upload = uploadResult.upload;
    let offset = 0;
    while (offset < data.length) {
      const chunk = data.subarray(offset);
      const writeResult = fn.upload_write(upload, chunk, chunk.length);
      if (writeResult.error) {
        const err = koffi.decode(writeResult.error, UplinkError);
        fn.upload_abort(upload);
        throw new StorjError(err.code, err.message ?? "Write failed");
      }
      offset += Number(writeResult.bytes_written);
    }

    const commitErrPtr = fn.upload_commit(upload);
    checkRawError(commitErrPtr, "Failed to commit upload");

    return { key, isPrefix: false, contentLength: data.length, created: Date.now(), expires: 0 };
  }

  // -- Download --

  downloadBytes(bucket: string, key: string): Buffer {
    const dlResult = fn.download_object(this.projectPtr, bucket, key, null);
    if (dlResult.error) {
      const err = koffi.decode(dlResult.error, UplinkError);
      fn.free_download_result(dlResult);
      throw new StorjError(err.code, err.message ?? "Failed to start download");
    }

    const download = dlResult.download;
    const chunks: Buffer[] = [];
    const bufSize = 64 * 1024;

    try {
      while (true) {
        const buf = Buffer.alloc(bufSize);
        const readResult = fn.download_read(download, buf, bufSize);
        const bytesRead = Number(readResult.bytes_read);

        if (bytesRead > 0) {
          chunks.push(buf.subarray(0, bytesRead));
        }

        if (readResult.error || bytesRead === 0) break;
      }
    } finally {
      fn.close_download(download);
    }

    return Buffer.concat(chunks);
  }

  // -- Share --

  createShareGrant(bucket: string, prefix: string, permissions?: {
    allowDownload?: boolean;
    allowList?: boolean;
  }): string {
    const perm = {
      allow_download: permissions?.allowDownload ?? true,
      allow_upload: false,
      allow_list: permissions?.allowList ?? true,
      allow_delete: false,
      not_before: 0,
      not_after: 0,
    };

    const prefixes = [{ bucket, prefix }];

    const shareResult = fn.access_share(this.accessPtr, perm, prefixes, prefixes.length);
    if (shareResult.error) {
      const err = koffi.decode(shareResult.error, UplinkError);
      fn.free_access_result(shareResult);
      throw new StorjError(err.code, err.message ?? "Failed to create share");
    }

    const serialized = fn.access_serialize(shareResult.access);
    if (serialized.error) {
      const err = koffi.decode(serialized.error, UplinkError);
      fn.free_string_result(serialized);
      fn.free_access_result(shareResult);
      throw new StorjError(err.code, err.message ?? "Failed to serialize access");
    }

    const grant = serialized.string;
    fn.free_string_result(serialized);
    fn.free_access_result(shareResult);

    return grant;
  }
}
